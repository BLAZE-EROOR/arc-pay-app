// ─── Arc Testnet Config ───────────────────────────────────────────────────────
const ARC_CHAIN_ID_DECIMAL = 5042002;
const ARC_RPC = "https://rpc.testnet.arc.network";

// Contract addresses (official docs.arc.network)
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// ─── State ────────────────────────────────────────────────────────────────────
let provider, signer, userAddress;
let usdcContract, eurcContract;
let selectedToken = "USDC";
let contacts = JSON.parse(localStorage.getItem("arcpay_contacts") || "[]");
let txHistory = JSON.parse(localStorage.getItem("arcpay_txhistory") || "[]");

// ─── Connect Wallet ───────────────────────────────────────────────────────────
async function connectWallet() {
  try {
    if (!window.ethereum) {
      alert("No wallet found! Please install Rabby or MetaMask.");
      return;
    }

    document.getElementById("connectBtn").innerText = "Connecting...";
    document.getElementById("connectBtn").disabled = true;

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    const network = await provider.getNetwork();
    if (Number(network.chainId) !== ARC_CHAIN_ID_DECIMAL) {
      alert("Please switch to Arc Testnet in your Rabby wallet first, then click Connect again.");
      document.getElementById("connectBtn").innerText = "Connect Wallet";
      document.getElementById("connectBtn").disabled = false;
      return;
    }

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
    eurcContract = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, signer);

    await refreshBalances();

    // Show dashboard
    document.getElementById("connectOverlay").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
    document.getElementById("walletBar").style.display = "flex";
    document.getElementById("connectBtn").innerText = "✅ Connected";

    // Update wallet address display
    document.getElementById("walletAddr").innerText =
      userAddress.slice(0, 6) + "..." + userAddress.slice(-4);

    // Generate QR code
    generateQR(userAddress);
    document.getElementById("qrAddress").innerText = userAddress;

    // Render contacts and history
    renderContacts();
    renderTxHistory();

    // Check for payment link params in URL
    handleIncomingPaymentLink();

  } catch (err) {
    console.error(err);
    document.getElementById("connectBtn").innerText = "Connect Wallet";
    document.getElementById("connectBtn").disabled = false;
    alert("Error: " + err.message);
  }
}

// ─── Balances ─────────────────────────────────────────────────────────────────
async function refreshBalances() {
  try {
    const [usdcBal, eurcBal] = await Promise.all([
      usdcContract.balanceOf(userAddress),
      eurcContract.balanceOf(userAddress)
    ]);
    document.getElementById("usdcBal").innerText =
      parseFloat(ethers.formatUnits(usdcBal, 6)).toFixed(2) + " USDC";
    document.getElementById("eurcBal").innerText =
      parseFloat(ethers.formatUnits(eurcBal, 6)).toFixed(2) + " EURC";
  } catch (e) {
    console.error("Balance refresh error:", e);
  }
}

// ─── Token Selector ───────────────────────────────────────────────────────────
function selectToken(token) {
  selectedToken = token;
  document.getElementById("tab-usdc").className =
    "token-tab" + (token === "USDC" ? " active-usdc" : "");
  document.getElementById("tab-eurc").className =
    "token-tab" + (token === "EURC" ? " active-eurc" : "");
}

// ─── Send Token ───────────────────────────────────────────────────────────────
async function sendToken() {
  try {
    const recipient = document.getElementById("recipient").value.trim();
    const amount = document.getElementById("amount").value.trim();

    if (!recipient || !amount) {
      showStatus("Please fill in both fields.", "error"); return;
    }
    if (!ethers.isAddress(recipient)) {
      showStatus("Invalid wallet address!", "error"); return;
    }
    if (parseFloat(amount) <= 0) {
      showStatus("Amount must be greater than 0.", "error"); return;
    }

    showStatus(`Sending ${amount} ${selectedToken}... confirm in Rabby.`, "info");

    const contract = selectedToken === "USDC" ? usdcContract : eurcContract;
    const parsedAmount = ethers.parseUnits(amount, 6);
    const tx = await contract.transfer(recipient, parsedAmount);

    showStatus("Transaction sent! Waiting for confirmation...", "info");
    const receipt = await tx.wait();

    // Save to history
    const txRecord = {
      hash: tx.hash,
      type: "sent",
      token: selectedToken,
      amount: amount,
      address: recipient,
      time: Date.now()
    };
    txHistory.unshift(txRecord);
    if (txHistory.length > 50) txHistory.pop();
    localStorage.setItem("arcpay_txhistory", JSON.stringify(txHistory));
    renderTxHistory();

    await refreshBalances();

    showStatus(
      `✅ Sent ${amount} ${selectedToken}! <a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank" style="color:inherit;">View on Explorer ↗</a>`,
      "success"
    );

    document.getElementById("recipient").value = "";
    document.getElementById("amount").value = "";

  } catch (err) {
    showStatus("Error: " + err.message, "error");
  }
}

// ─── Transaction History ──────────────────────────────────────────────────────
function renderTxHistory() {
  const list = document.getElementById("txList");
  if (txHistory.length === 0) {
    list.innerHTML = '<div class="empty-state">No transactions yet.<br>Send something to see history here!</div>';
    return;
  }

  list.innerHTML = txHistory.map(tx => {
    const isSent = tx.type === "sent";
    const addr = tx.address
      ? tx.address.slice(0, 6) + "..." + tx.address.slice(-4)
      : "Unknown";
    const timeStr = new Date(tx.time).toLocaleString();
    const icon = isSent ? "↑" : "↓";
    const iconClass = isSent ? "sent" : "received";
    const amountPrefix = isSent ? "-" : "+";

    return `
      <div class="tx-item" onclick="window.open('https://testnet.arcscan.app/tx/${tx.hash}','_blank')">
        <div class="tx-left">
          <div class="tx-icon ${iconClass}">${icon}</div>
          <div>
            <div>${isSent ? "Sent to" : "Received from"} <b>${addr}</b></div>
            <div class="tx-addr">${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div class="tx-amount ${iconClass}">${amountPrefix}${tx.amount} ${tx.token}</div>
          <div class="tx-time">${timeStr}</div>
        </div>
      </div>
    `;
  }).join("");
}

// ─── Address Book ─────────────────────────────────────────────────────────────
function toggleAddContact() {
  const form = document.getElementById("addContactForm");
  form.classList.toggle("show");
}

function saveContact() {
  const name = document.getElementById("contactName").value.trim();
  const addr = document.getElementById("contactAddr").value.trim();

  if (!name || !addr) { alert("Please fill in both fields."); return; }
  if (!ethers.isAddress(addr)) { alert("Invalid wallet address!"); return; }

  contacts.push({ name, addr });
  localStorage.setItem("arcpay_contacts", JSON.stringify(contacts));

  document.getElementById("contactName").value = "";
  document.getElementById("contactAddr").value = "";
  document.getElementById("addContactForm").classList.remove("show");

  renderContacts();
}

function deleteContact(index) {
  contacts.splice(index, 1);
  localStorage.setItem("arcpay_contacts", JSON.stringify(contacts));
  renderContacts();
}

function useContact(addr) {
  document.getElementById("recipient").value = addr;
  // Scroll to send section smoothly
  document.getElementById("recipient").scrollIntoView({ behavior: "smooth" });
  document.getElementById("recipient").focus();
}

function renderContacts() {
  const list = document.getElementById("contactList");
  if (contacts.length === 0) {
    list.innerHTML = '<div class="empty-state">No contacts yet.<br>Add one above!</div>';
    return;
  }

  list.innerHTML = contacts.map((c, i) => `
    <div class="contact-item">
      <div onclick="useContact('${c.addr}')" style="flex:1;">
        <div class="contact-name">${c.name}</div>
        <div class="contact-addr">${c.addr.slice(0,8)}...${c.addr.slice(-6)}</div>
      </div>
      <div class="contact-actions">
        <button class="icon-btn" onclick="useContact('${c.addr}')" title="Send to">💸</button>
        <button class="icon-btn" onclick="deleteContact(${i})" title="Delete">🗑️</button>
      </div>
    </div>
  `).join("");
}

// ─── QR Code Generator ────────────────────────────────────────────────────────
function generateQR(text) {
  const canvas = document.getElementById("qrCanvas");
  const ctx = canvas.getContext("2d");
  const size = 160;
  canvas.width = size;
  canvas.height = size;

  // Simple QR-like visual using a deterministic pixel pattern from the address
  // (This is a visual representation — for production use a real QR library)
  const cellSize = 8;
  const cells = size / cellSize; // 20 cells

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // Use address bytes to generate pattern
  const bytes = [];
  for (let i = 2; i < text.length; i += 2) {
    bytes.push(parseInt(text.slice(i, i + 2), 16));
  }

  ctx.fillStyle = "#0a0a0f";

  // Corner markers (standard QR finder patterns)
  drawFinder(ctx, 0, 0, cellSize);
  drawFinder(ctx, (cells - 7) * cellSize, 0, cellSize);
  drawFinder(ctx, 0, (cells - 7) * cellSize, cellSize);

  // Data modules from address
  let byteIdx = 0;
  let bitIdx = 0;
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      // Skip finder pattern areas
      if ((row < 9 && col < 9) ||
          (row < 9 && col >= cells - 8) ||
          (row >= cells - 8 && col < 9)) continue;

      const byte = bytes[byteIdx % bytes.length];
      const bit = (byte >> (7 - bitIdx)) & 1;
      bitIdx++;
      if (bitIdx === 8) { bitIdx = 0; byteIdx++; }

      if (bit) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize - 1, cellSize - 1);
      }
    }
  }
}

function drawFinder(ctx, x, y, cs) {
  // Outer 7x7 black square
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(x, y, 7 * cs, 7 * cs);
  // White inner
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + cs, y + cs, 5 * cs, 5 * cs);
  // Black center
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(x + 2 * cs, y + 2 * cs, 3 * cs, 3 * cs);
}

// ─── Payment Links ────────────────────────────────────────────────────────────
function generatePaymentLink() {
  const amount = document.getElementById("requestAmount").value.trim();
  if (!amount || !userAddress) {
    document.getElementById("paymentLink").innerText = "Connect wallet and enter amount first.";
    return;
  }

  const base = window.location.href.split("?")[0];
  const link = `${base}?to=${userAddress}&amount=${amount}&token=${selectedToken}`;
  document.getElementById("paymentLink").innerText = link;
}

function copyPaymentLink() {
  const link = document.getElementById("paymentLink").innerText;
  if (link.startsWith("http")) {
    navigator.clipboard.writeText(link);
    const btn = event.target;
    btn.innerText = "✅ Copied!";
    setTimeout(() => btn.innerText = "📋 Copy Link", 2000);
  }
}

function handleIncomingPaymentLink() {
  const params = new URLSearchParams(window.location.search);
  const to = params.get("to");
  const amount = params.get("amount");
  const token = params.get("token");

  if (to && amount) {
    document.getElementById("recipient").value = to;
    document.getElementById("amount").value = amount;
    if (token) selectToken(token);
    showStatus(`💡 Payment link detected! Sending ${amount} ${token || "USDC"} to ${to.slice(0,6)}...`, "info");
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────
function showStatus(message, type) {
  const el = document.getElementById("status");
  el.innerHTML = message;
  el.className = type;
}
// ─── Staking ──────────────────────────────────────────────────────────────────
const STAKING_ADDRESS = "0xBe0A823eD7Bd9eD9cc5Ebc470b0DBeB1653E8632";
const STAKING_ABI = [
  "function stake(uint256 amount) external",
  "function unstake() external",
  "function claimRewards() external",
  "function getStake(address user) external view returns (uint256 amount, uint256 startTime, uint256 pending)",
  "function totalStaked() external view returns (uint256)"
];

let stakingContract;

async function initStaking() {
  stakingContract = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, signer);
  await refreshStaking();
}

async function refreshStaking() {
  try {
    const [amount, startTime, pending] = await stakingContract.getStake(userAddress);
    const total = await stakingContract.totalStaked();

    document.getElementById("stakedAmount").innerText = parseFloat(ethers.formatUnits(amount, 6)).toFixed(2);
    document.getElementById("pendingReward").innerText = parseFloat(ethers.formatUnits(pending, 6)).toFixed(6);
    document.getElementById("totalStaked").innerText = parseFloat(ethers.formatUnits(total, 6)).toFixed(2);

    if (amount > 0) {
      const since = new Date(Number(startTime) * 1000).toLocaleString();
      document.getElementById("stakingSince").innerText = since;
    } else {
      document.getElementById("stakingSince").innerText = "Not staking";
    }
  } catch (e) {
    console.error("Staking refresh error:", e);
  }
}

async function stakeUSDC() {
  try {
    const amount = document.getElementById("stakeAmount").value.trim();
    if (!amount || parseFloat(amount) <= 0) {
      showStakingStatus("Enter a valid amount.", "error"); return;
    }

    showStakingStatus("Approving USDC... confirm in Rabby.", "info");

    // First approve the staking contract to spend USDC
    const approveTx = await usdcContract.approve(STAKING_ADDRESS, ethers.parseUnits(amount, 6));
    await approveTx.wait();

    showStakingStatus("Staking USDC... confirm in Rabby.", "info");
    const tx = await stakingContract.stake(ethers.parseUnits(amount, 6));
    await tx.wait();

    await refreshStaking();
    await refreshBalances();
    showStakingStatus(`✅ Staked ${amount} USDC successfully!`, "success");
    document.getElementById("stakeAmount").value = "";
  } catch (e) {
    showStakingStatus("Error: " + e.message, "error");
  }
}

async function unstakeUSDC() {
  try {
    showStakingStatus("Unstaking... confirm in Rabby.", "info");
    const tx = await stakingContract.unstake();
    await tx.wait();
    await refreshStaking();
    await refreshBalances();
    showStakingStatus("✅ Unstaked successfully! Principal + rewards returned.", "success");
  } catch (e) {
    showStakingStatus("Error: " + e.message, "error");
  }
}

async function claimRewardsOnly() {
  try {
    showStakingStatus("Claiming rewards... confirm in Rabby.", "info");
    const tx = await stakingContract.claimRewards();
    await tx.wait();
    await refreshStaking();
    await refreshBalances();
    showStakingStatus("✅ Rewards claimed!", "success");
  } catch (e) {
    showStakingStatus("Error: " + e.message, "error");
  }
}

function showStakingStatus(message, type) {
  const el = document.getElementById("stakingStatus");
  el.innerHTML = message;
  el.className = type;
}
// ─── AI Suggestions ───────────────────────────────────────────────────────────
async function getAISuggestions() {
  try {
    document.getElementById("aiLoading").style.display = "block";
    document.getElementById("aiSuggestions").innerHTML = "";

    // Gather wallet data
    const walletData = {
      usdcBalance: document.getElementById("usdcBal").innerText,
      eurcBalance: document.getElementById("eurcBal").innerText,
      stakedAmount: document.getElementById("stakedAmount").innerText,
      pendingRewards: document.getElementById("pendingReward").innerText,
      stakingSince: document.getElementById("stakingSince").innerText,
      txCount: txHistory.length,
      lastTx: txHistory.length > 0
        ? `${txHistory[0].type} ${txHistory[0].amount} ${txHistory[0].token} on ${new Date(txHistory[0].time).toLocaleDateString()}`
        : "No transactions yet"
    };

    const response = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletData })
    });

    const data = await response.json();
    document.getElementById("aiLoading").style.display = "none";

    if (data.error) {
      document.getElementById("aiSuggestions").innerHTML =
        '<div style="color:var(--red);font-size:12px;">Failed to get suggestions. Try again.</div>';
      return;
    }

    document.getElementById("aiSuggestions").innerHTML = data.suggestions.map(s => `
      <div style="display:flex;align-items:flex-start;gap:12px;background:var(--surface2);border-radius:10px;padding:14px;border:1px solid var(--border);">
        <div style="font-size:24px;flex-shrink:0;">${s.icon}</div>
        <div style="font-size:13px;line-height:1.6;color:var(--text);">${s.text}</div>
      </div>
    `).join("");

  } catch (err) {
    document.getElementById("aiLoading").style.display = "none";
    document.getElementById("aiSuggestions").innerHTML =
      '<div style="color:var(--red);font-size:12px;">Error: ' + err.message + '</div>';
  }
}