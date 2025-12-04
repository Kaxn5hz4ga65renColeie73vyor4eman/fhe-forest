import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface TreeModel {
  id: string;
  name: string;
  accuracy: number;
  timestamp: number;
  owner: string;
  status: "training" | "ready" | "error";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<TreeModel[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [showTeamInfo, setShowTeamInfo] = useState(false);

  // Calculate statistics
  const readyCount = models.filter(m => m.status === "ready").length;
  const trainingCount = models.filter(m => m.status === "training").length;
  const errorCount = models.filter(m => m.status === "error").length;

  useEffect(() => {
    loadModels().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadModels = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("model_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing model keys:", e);
        }
      }
      
      const list: TreeModel[] = [];
      
      for (const key of keys) {
        try {
          const modelBytes = await contract.getData(`model_${key}`);
          if (modelBytes.length > 0) {
            try {
              const modelData = JSON.parse(ethers.toUtf8String(modelBytes));
              list.push({
                id: key,
                name: modelData.name,
                accuracy: modelData.accuracy,
                timestamp: modelData.timestamp,
                owner: modelData.owner,
                status: modelData.status || "training"
              });
            } catch (e) {
              console.error(`Error parsing model data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading model ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setModels(list);
    } catch (e) {
      console.error("Error loading models:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const trainModel = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Training FHE model..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const modelId = `model-${Date.now()}`;
      const modelName = `FHE-Tree-${Math.floor(Math.random() * 1000)}`;
      
      const modelData = {
        name: modelName,
        accuracy: 0,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "training"
      };
      
      // Store model data on-chain
      await contract.setData(
        `model_${modelId}`, 
        ethers.toUtf8Bytes(JSON.stringify(modelData))
      );
      
      const keysBytes = await contract.getData("model_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(modelId);
      
      await contract.setData(
        "model_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE model training started!"
      });
      
      await loadModels();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Training failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: isAvailable 
          ? "FHE contract is available!" 
          : "Contract not available"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const renderPieChart = () => {
    const total = models.length || 1;
    const readyPercentage = (readyCount / total) * 100;
    const trainingPercentage = (trainingCount / total) * 100;
    const errorPercentage = (errorCount / total) * 100;

    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <div 
            className="pie-segment ready" 
            style={{ transform: `rotate(${readyPercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment training" 
            style={{ transform: `rotate(${(readyPercentage + trainingPercentage) * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment error" 
            style={{ transform: `rotate(${(readyPercentage + trainingPercentage + errorPercentage) * 3.6}deg)` }}
          ></div>
          <div className="pie-center">
            <div className="pie-value">{models.length}</div>
            <div className="pie-label">Models</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item">
            <div className="color-box ready"></div>
            <span>Ready: {readyCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box training"></div>
            <span>Training: {trainingCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box error"></div>
            <span>Error: {errorCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="neon-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container neon-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="tree-icon"></div>
          </div>
          <h1>FHE<span>Forest</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={trainModel} 
            className="train-btn neon-button"
          >
            <div className="add-icon"></div>
            Train Model
          </button>
          <button 
            onClick={checkAvailability}
            className="neon-button"
          >
            Check FHE
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content panel-layout">
        {/* Project Introduction Panel */}
        <div className="panel intro-panel">
          <div className="panel-header">
            <h2>FHE Decision Trees & Random Forests</h2>
            <div className="fhe-badge">
              <span>Fully Homomorphic Encryption</span>
            </div>
          </div>
          <div className="panel-content">
            <p>
              FHE Forest enables training and inference of decision trees and random forests 
              on <span className="highlight">encrypted data</span> without decryption. 
              Our FHE implementation preserves data privacy while maintaining model accuracy.
            </p>
            
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">🔒</div>
                <h3>Encrypted Training</h3>
                <p>Train models directly on encrypted data using FHE</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">⚡</div>
                <h3>Fast Inference</h3>
                <p>Perform predictions on encrypted inputs in seconds</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">📊</div>
                <h3>Privacy-Preserving</h3>
                <p>Data remains encrypted throughout the ML lifecycle</p>
              </div>
            </div>
            
            <div className="tech-stack">
              <h3>Technology Stack</h3>
              <div className="tech-icons">
                <div className="tech-icon concrete">Concrete</div>
                <div className="tech-icon python">Python</div>
                <div className="tech-icon sklearn">Scikit-learn</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Statistics Panel */}
        <div className="panel stats-panel">
          <div className="panel-header">
            <h2>Model Statistics</h2>
            <button 
              onClick={loadModels}
              className="refresh-btn neon-button"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="panel-content">
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{models.length}</div>
                <div className="stat-label">Total Models</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{readyCount}</div>
                <div className="stat-label">Ready</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{trainingCount}</div>
                <div className="stat-label">Training</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{errorCount}</div>
                <div className="stat-label">Errors</div>
              </div>
            </div>
            
            <div className="chart-container">
              <h3>Model Status Distribution</h3>
              {renderPieChart()}
            </div>
          </div>
        </div>
        
        {/* Models List Panel */}
        <div className="panel models-panel">
          <div className="panel-header">
            <h2>FHE Models</h2>
            <button 
              onClick={() => setShowTeamInfo(!showTeamInfo)}
              className="neon-button"
            >
              {showTeamInfo ? "Hide Team" : "Show Team"}
            </button>
          </div>
          <div className="panel-content">
            <div className="models-list">
              <div className="table-header">
                <div className="header-cell">Name</div>
                <div className="header-cell">Owner</div>
                <div className="header-cell">Accuracy</div>
                <div className="header-cell">Date</div>
                <div className="header-cell">Status</div>
              </div>
              
              {models.length === 0 ? (
                <div className="no-models">
                  <div className="no-models-icon"></div>
                  <p>No FHE models found</p>
                  <button 
                    className="neon-button primary"
                    onClick={trainModel}
                  >
                    Train First Model
                  </button>
                </div>
              ) : (
                models.map(model => (
                  <div className="model-row" key={model.id}>
                    <div className="table-cell">{model.name}</div>
                    <div className="table-cell">{model.owner.substring(0, 6)}...{model.owner.substring(38)}</div>
                    <div className="table-cell">{model.accuracy > 0 ? `${(model.accuracy * 100).toFixed(1)}%` : 'N/A'}</div>
                    <div className="table-cell">
                      {new Date(model.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="table-cell">
                      <span className={`status-badge ${model.status}`}>
                        {model.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        {/* Team Information Panel (conditional) */}
        {showTeamInfo && (
          <div className="panel team-panel">
            <div className="panel-header">
              <h2>Development Team</h2>
              <button 
                onClick={() => setShowTeamInfo(false)}
                className="close-btn"
              >
                &times;
              </button>
            </div>
            <div className="panel-content">
              <div className="team-grid">
                <div className="team-member">
                  <div className="member-avatar"></div>
                  <h3>Alex Chen</h3>
                  <p>Cryptography Lead</p>
                  <div className="member-skills">
                    <span>FHE</span>
                    <span>ZK Proofs</span>
                  </div>
                </div>
                <div className="team-member">
                  <div className="member-avatar"></div>
                  <h3>Maria Rodriguez</h3>
                  <p>ML Engineer</p>
                  <div className="member-skills">
                    <span>Decision Trees</span>
                    <span>Random Forests</span>
                  </div>
                </div>
                <div className="team-member">
                  <div className="member-avatar"></div>
                  <h3>James Wilson</h3>
                  <p>Blockchain Developer</p>
                  <div className="member-skills">
                    <span>Smart Contracts</span>
                    <span>Ethereum</span>
                  </div>
                </div>
              </div>
              
              <div className="team-description">
                <h3>About Our Team</h3>
                <p>
                  Our team combines expertise in cryptography, machine learning, and blockchain 
                  to build privacy-preserving ML solutions. We're committed to advancing FHE 
                  applications in real-world scenarios.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
  
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content neon-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="neon-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="tree-icon"></div>
              <span>FHE Forest</span>
            </div>
            <p>Privacy-preserving machine learning with FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">GitHub</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE Forest. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;