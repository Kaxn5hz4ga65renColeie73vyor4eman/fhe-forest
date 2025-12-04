// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EncryptedBikeSharing is SepoliaConfig {
    struct EncryptedRide {
        uint256 id;
        euint32 encryptedStartStation;
        euint32 encryptedEndStation;
        euint32 encryptedTimestamp;
        euint32 encryptedUserCategory;
    }

    struct DecryptedRide {
        string startStation;
        string endStation;
        uint256 timestamp;
        string userCategory;
        bool isRevealed;
    }

    uint256 public rideCount;
    mapping(uint256 => EncryptedRide) public encryptedRides;
    mapping(uint256 => DecryptedRide) public decryptedRides;

    mapping(string => euint32) private encryptedStationCount;
    string[] private stationList;

    mapping(uint256 => uint256) private requestToRideId;

    event RideSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event RideDecrypted(uint256 indexed id);

    modifier onlyRider(uint256 rideId) {
        // Placeholder for access control
        _;
    }

    /// @notice Submit a new encrypted ride
    function submitEncryptedRide(
        euint32 encryptedStartStation,
        euint32 encryptedEndStation,
        euint32 encryptedTimestamp,
        euint32 encryptedUserCategory
    ) public {
        rideCount += 1;
        uint256 newId = rideCount;

        encryptedRides[newId] = EncryptedRide({
            id: newId,
            encryptedStartStation: encryptedStartStation,
            encryptedEndStation: encryptedEndStation,
            encryptedTimestamp: encryptedTimestamp,
            encryptedUserCategory: encryptedUserCategory
        });

        decryptedRides[newId] = DecryptedRide({
            startStation: "",
            endStation: "",
            timestamp: 0,
            userCategory: "",
            isRevealed: false
        });

        emit RideSubmitted(newId, block.timestamp);
    }

    /// @notice Request decryption of a ride
    function requestRideDecryption(uint256 rideId) public onlyRider(rideId) {
        EncryptedRide storage ride = encryptedRides[rideId];
        require(!decryptedRides[rideId].isRevealed, "Already decrypted");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(ride.encryptedStartStation);
        ciphertexts[1] = FHE.toBytes32(ride.encryptedEndStation);
        ciphertexts[2] = FHE.toBytes32(ride.encryptedTimestamp);
        ciphertexts[3] = FHE.toBytes32(ride.encryptedUserCategory);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptRide.selector);
        requestToRideId[reqId] = rideId;

        emit DecryptionRequested(rideId);
    }

    /// @notice Callback for decrypted ride
    function decryptRide(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 rideId = requestToRideId[requestId];
        require(rideId != 0, "Invalid request");

        DecryptedRide storage dRide = decryptedRides[rideId];
        require(!dRide.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));

        dRide.startStation = results[0];
        dRide.endStation = results[1];
        dRide.timestamp = parseUint(results[2]);
        dRide.userCategory = results[3];
        dRide.isRevealed = true;

        if (!FHE.isInitialized(encryptedStationCount[dRide.startStation])) {
            encryptedStationCount[dRide.startStation] = FHE.asEuint32(0);
            stationList.push(dRide.startStation);
        }

        encryptedStationCount[dRide.startStation] = FHE.add(
            encryptedStationCount[dRide.startStation],
            FHE.asEuint32(1)
        );

        emit RideDecrypted(rideId);
    }

    /// @notice Get decrypted ride info
    function getDecryptedRide(uint256 rideId) public view returns (
        string memory startStation,
        string memory endStation,
        uint256 timestamp,
        string memory userCategory,
        bool isRevealed
    ) {
        DecryptedRide storage r = decryptedRides[rideId];
        return (r.startStation, r.endStation, r.timestamp, r.userCategory, r.isRevealed);
    }

    /// @notice Get encrypted station count
    function getEncryptedStationCount(string memory station) public view returns (euint32) {
        return encryptedStationCount[station];
    }

    /// @notice Request station count decryption
    function requestStationCountDecryption(string memory station) public {
        euint32 count = encryptedStationCount[station];
        require(FHE.isInitialized(count), "Station not found");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptStationCount.selector);
        requestToRideId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(station)));
    }

    /// @notice Callback for decrypted station count
    function decryptStationCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 stationHash = requestToRideId[requestId];
        string memory station = getStationFromHash(stationHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
        // Placeholder to use decrypted count
    }

    // Utility functions
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }

    function getStationFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < stationList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(stationList[i]))) == hash) {
                return stationList[i];
            }
        }
        revert("Station not found");
    }

    function parseUint(string memory s) private pure returns (uint256 result) {
        bytes memory b = bytes(s);
        for (uint i = 0; i < b.length; i++) {
            require(b[i] >= 0x30 && b[i] <= 0x39, "Invalid character");
            result = result * 10 + (uint8(b[i]) - 48);
        }
    }
}
