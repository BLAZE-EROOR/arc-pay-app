// ─── Arc Testnet Config ───────────────────────────────────────────────────────
const ARC_CHAIN_ID_DECIMAL = 5042002;
const ARC_CHAIN_ID_HEX = "0x4CE052";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const STAKING_ADDRESS = "0xBe0A823eD7Bd9eD9cc5Ebc470b0DBeB1653E8632";
const OPENROUTER_API_KEY = "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";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

const STAKING_ABI = [
  "function stake(uint256 amount) external",
  "function unstake() external",
  "function claimRewards() external",
  "function getStake(address user) external view returns (uint256 amount, uint256 startTime, uint256 pending)",
  "function totalStaked() external view returns (uint256)"
];

let provider, signer, userAddress;
let usdcContract, eurcContract, stakingContract;
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

    // Try to switch to Arc Testnet
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARC_CHAIN_ID_HEX }]
      });
    } catch (e) { console.log("Chain switch:", e.message); }

    const network = await provider.getNetwork();
    if (Number(network.chainId) !== ARC_CHAIN_ID_DECIMAL) {
      alert("Please switch to Arc Testnet in your wallet and try again.");
      document.getElementById("connectBtn").innerText = "Connect Wallet";
      document.getElementById("connectBtn").disabled = false;
      return;
    }

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
    eurcContract = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, signer);
    stakingContract = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, signer);

    await refreshBalances();

    document.getElementById("connectOverlay").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
    document.getElementById("walletBar").style.display = "flex";
    document.getElementById("connectBtn").innerText = "Connected";
    document.getElementById("connectBtn").disabled = false;
    document.getElementById("walletAddr").innerText = userAddress.slice(0,6) + "..." + userAddress.slice(-4);

    var qrEl = document.getElementById("qrAddress");
    if (qrEl) { generateQR(userAddress); qrEl.innerText = userAddress; }

    var faucetEl = document.getElementById("faucetAddr");
    if (faucetEl) faucetEl.value = userAddress;

    renderContacts();
    renderTxHistory();
    await refreshStaking();
    handleIncomingPaymentLink();

    localStorage.setItem("arcpay_connected", "true");

  } catch (err) {
    console.error(err);
    document.getElementById("connectBtn").innerText = "Connect Wallet";
    document.getElementById("connectBtn").disabled = false;
    alert("Error: " + err.message);
  }
}

// ─── Auto Connect ─────────────────────────────────────────────────────────────
window.onload = function() {
  if (localStorage.getItem("arcpay_connected") === "true" && window.ethereum) {
    window.ethereum.request({ method: "eth_accounts" }).then(function(accounts) {
      if (accounts.length > 0) connectWallet();
    }).catch(function(e) { console.log("Auto-connect failed:", e); });
  }
};

// ─── Balances ─────────────────────────────────────────────────────────────────
async function refreshBalances() {
  try {
    const [usdcBal, eurcBal] = await Promise.all([
      usdcContract.balanceOf(userAddress),
      eurcContract.balanceOf(userAddress)
    ]);
    document.getElementById("usdcBal").innerText = parseFloat(ethers.formatUnits(usdcBal, 6)).toFixed(2) + " USDC";
    document.getElementById("eurcBal").innerText = parseFloat(ethers.formatUnits(eurcBal, 6)).toFixed(2) + " EURC";
  } catch (e) { console.error("Balance error:", e); }
}

// ─── Token Selector ───────────────────────────────────────────────────────────
function selectToken(token) {
  selectedToken = token;
  document.getElementById("tab-usdc").className = "token-tab" + (token === "USDC" ? " active-usdc" : "");
  document.getElementById("tab-eurc").className = "token-tab" + (token === "EURC" ? " active-eurc" : "");
}

// ─── Send Token ───────────────────────────────────────────────────────────────
async function sendToken() {
  try {
    const recipient = document.getElementById("recipient").value.trim();
    const amount = document.getElementById("amount").value.trim();
    if (!recipient || !amount) { showStatus("Please fill in both fields.", "error"); return; }
    if (!ethers.isAddress(recipient)) { showStatus("Invalid wallet address!", "error"); return; }
    if (parseFloat(amount) <= 0) { showStatus("Amount must be greater than 0.", "error"); return; }
    showStatus("Sending " + amount + " " + selectedToken + "... confirm in wallet.", "info");
    const contract = selectedToken === "USDC" ? usdcContract : eurcContract;
    const tx = await contract.transfer(recipient, ethers.parseUnits(amount, 6));
    showStatus("Transaction sent! Waiting for confirmation...", "info");
    await tx.wait();
    const txRecord = { hash: tx.hash, type: "sent", token: selectedToken, amount: amount, address: recipient, time: Date.now() };
    txHistory.unshift(txRecord);
    if (txHistory.length > 50) txHistory.pop();
    localStorage.setItem("arcpay_txhistory", JSON.stringify(txHistory));
    renderTxHistory();
    await refreshBalances();
    showStatus("Sent " + amount + " " + selectedToken + "! <a href='https://testnet.arcscan.app/tx/" + tx.hash + "' target='_blank' style='color:inherit;'>View on Explorer</a>", "success");
    document.getElementById("recipient").value = "";
    document.getElementById("amount").value = "";
  } catch (err) { showStatus("Error: " + err.message, "error"); }
}

// ─── Transaction History ──────────────────────────────────────────────────────
function renderTxHistory() {
  const list = document.getElementById("txList");
  if (txHistory.length === 0) {
    list.innerHTML = '<div class="empty-state">No transactions yet.<br>Send something to see history here!</div>';
    return;
  }
  list.innerHTML = txHistory.map(function(tx) {
    const isSent = tx.type === "sent";
    const addr = tx.address ? tx.address.slice(0,6) + "..." + tx.address.slice(-4) : "Unknown";
    const timeStr = new Date(tx.time).toLocaleString();
    return '<div class="tx-item" onclick="window.open(\'https://testnet.arcscan.app/tx/' + tx.hash + '\',\'_blank\')">'
      + '<div class="tx-left"><div class="tx-icon ' + (isSent ? 'sent' : 'received') + '">' + (isSent ? '↑' : '↓') + '</div>'
      + '<div><div>' + (isSent ? 'Sent to' : 'Received from') + ' <b>' + addr + '</b></div>'
      + '<div class="tx-addr">' + tx.hash.slice(0,10) + '...' + tx.hash.slice(-6) + '</div></div></div>'
      + '<div style="text-align:right;"><div class="tx-amount ' + (isSent ? 'sent' : 'received') + '">' + (isSent ? '-' : '+') + tx.amount + ' ' + tx.token + '</div>'
      + '<div class="tx-time">' + timeStr + '</div></div></div>';
  }).join("");
}

// ─── Address Book ─────────────────────────────────────────────────────────────
function toggleAddContact() { document.getElementById("addContactForm").classList.toggle("show"); }

function saveContact() {
  const name = document.getElementById("contactName").value.trim();
  const addr = document.getElementById("contactAddr").value.trim();
  if (!name || !addr) { alert("Please fill in both fields."); return; }
  if (!ethers.isAddress(addr)) { alert("Invalid wallet address!"); return; }
  contacts.push({ name: name, addr: addr });
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
  document.getElementById("recipient").scrollIntoView({ behavior: "smooth" });
  document.getElementById("recipient").focus();
}

function renderContacts() {
  const list = document.getElementById("contactList");
  if (contacts.length === 0) {
    list.innerHTML = '<div class="empty-state">No contacts yet.<br>Add one above!</div>';
    return;
  }
  list.innerHTML = contacts.map(function(c, i) {
    return '<div class="contact-item"><div onclick="useContact(\'' + c.addr + '\')" style="flex:1;">'
      + '<div class="contact-name">' + c.name + '</div>'
      + '<div class="contact-addr">' + c.addr.slice(0,8) + '...' + c.addr.slice(-6) + '</div></div>'
      + '<div class="contact-actions">'
      + '<button class="icon-btn" onclick="useContact(\'' + c.addr + '\')" title="Send to">💸</button>'
      + '<button class="icon-btn" onclick="deleteContact(' + i + ')" title="Delete">🗑️</button>'
      + '</div></div>';
  }).join("");
}

// ─── QR Code ──────────────────────────────────────────────────────────────────
function generateQR(text) {
  const canvas = document.getElementById("qrCanvas");
  const ctx = canvas.getContext("2d");
  const size = 160; const cellSize = 8; const cells = size / cellSize;
  canvas.width = size; canvas.height = size;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size);
  const bytes = [];
  for (let i = 2; i < text.length; i += 2) bytes.push(parseInt(text.slice(i, i+2), 16));
  ctx.fillStyle = "#0a0a0f";
  drawFinder(ctx, 0, 0, cellSize);
  drawFinder(ctx, (cells-7)*cellSize, 0, cellSize);
  drawFinder(ctx, 0, (cells-7)*cellSize, cellSize);
  let byteIdx = 0, bitIdx = 0;
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      if ((row < 9 && col < 9) || (row < 9 && col >= cells-8) || (row >= cells-8 && col < 9)) continue;
      const byte = bytes[byteIdx % bytes.length];
      const bit = (byte >> (7 - bitIdx)) & 1;
      bitIdx++; if (bitIdx === 8) { bitIdx = 0; byteIdx++; }
      if (bit) ctx.fillRect(col*cellSize, row*cellSize, cellSize-1, cellSize-1);
    }
  }
}

function drawFinder(ctx, x, y, cs) {
  ctx.fillStyle = "#0a0a0f"; ctx.fillRect(x, y, 7*cs, 7*cs);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(x+cs, y+cs, 5*cs, 5*cs);
  ctx.fillStyle = "#0a0a0f"; ctx.fillRect(x+2*cs, y+2*cs, 3*cs, 3*cs);
}

// ─── Payment Links ────────────────────────────────────────────────────────────
function generatePaymentLink() {
  const amount = document.getElementById("requestAmount").value.trim();
  if (!amount || !userAddress) { document.getElementById("paymentLink").innerText = "Connect wallet and enter amount first."; return; }
  const base = window.location.href.split("?")[0];
  document.getElementById("paymentLink").innerText = base + "?to=" + userAddress + "&amount=" + amount + "&token=" + selectedToken;
}

function copyPaymentLink() {
  const link = document.getElementById("paymentLink").innerText;
  if (link.startsWith("http")) {
    navigator.clipboard.writeText(link);
    const btn = event.target;
    btn.innerText = "Copied!";
    setTimeout(function() { btn.innerText = "📋 Copy Link"; }, 2000);
  }
}

function handleIncomingPaymentLink() {
  const params = new URLSearchParams(window.location.search);
  const to = params.get("to"), amount = params.get("amount"), token = params.get("token");
  if (to && amount) {
    document.getElementById("recipient").value = to;
    document.getElementById("amount").value = amount;
    if (token) selectToken(token);
    showStatus("Payment link detected! Sending " + amount + " " + (token || "USDC") + " to " + to.slice(0,6) + "...", "info");
  }
}

// ─── Staking ──────────────────────────────────────────────────────────────────
async function refreshStaking() {
  try {
    const [amount, startTime, pending] = await stakingContract.getStake(userAddress);
    const total = await stakingContract.totalStaked();
    document.getElementById("stakedAmount").innerText = parseFloat(ethers.formatUnits(amount, 6)).toFixed(2);
    document.getElementById("pendingReward").innerText = parseFloat(ethers.formatUnits(pending, 6)).toFixed(6);
    document.getElementById("totalStaked").innerText = parseFloat(ethers.formatUnits(total, 6)).toFixed(2);
    document.getElementById("stakingSince").innerText = amount > 0 ? new Date(Number(startTime) * 1000).toLocaleString() : "Not staking";
  } catch (e) { console.error("Staking error:", e); }
}

async function stakeUSDC() {
  try {
    const amount = document.getElementById("stakeAmount").value.trim();
    if (!amount || parseFloat(amount) <= 0) { showStakingStatus("Enter a valid amount.", "error"); return; }
    showStakingStatus("Step 1/2: Approving USDC... confirm in wallet.", "info");
    const approveTx = await usdcContract.approve(STAKING_ADDRESS, ethers.parseUnits(amount, 6));
    await approveTx.wait();
    showStakingStatus("Step 2/2: Staking USDC... confirm in wallet.", "info");
    const tx = await stakingContract.stake(ethers.parseUnits(amount, 6));
    await tx.wait();
    await refreshStaking();
    await refreshBalances();
    showStakingStatus("Staked " + amount + " USDC! Earning 10% APY.", "success");
    document.getElementById("stakeAmount").value = "";
  } catch (e) { showStakingStatus("Error: " + e.message, "error"); }
}

async function unstakeUSDC() {
  try {
    showStakingStatus("Unstaking... confirm in wallet.", "info");
    const tx = await stakingContract.unstake();
    await tx.wait();
    await refreshStaking();
    await refreshBalances();
    showStakingStatus("Unstaked! Principal + rewards returned to wallet.", "success");
  } catch (e) { showStakingStatus("Error: " + e.message, "error"); }
}

async function claimRewardsOnly() {
  try {
    showStakingStatus("Claiming rewards... confirm in wallet.", "info");
    const tx = await stakingContract.claimRewards();
    await tx.wait();
    await refreshStaking();
    await refreshBalances();
    showStakingStatus("Rewards claimed to your wallet!", "success");
  } catch (e) { showStakingStatus("Error: " + e.message, "error"); }
}

setInterval(function() { if (stakingContract && userAddress) refreshStaking(); }, 30000);

// ─── Faucet ───────────────────────────────────────────────────────────────────
function copyFaucetAddress() {
  if (!userAddress) { alert("Connect your wallet first!"); return; }
  navigator.clipboard.writeText(userAddress);
  const btn = event.target;
  btn.innerText = "Copied!";
  setTimeout(function() { btn.innerText = "📋 Copy"; }, 2000);
}

// ─── AI Suggestions ───────────────────────────────────────────────────────────
async function getAISuggestions() {
  try {
    document.getElementById("aiLoading").style.display = "block";
    document.getElementById("aiSuggestions").innerHTML = "";

    const walletData = {
      usdcBalance: document.getElementById("usdcBal").innerText,
      stakedAmount: document.getElementById("stakedAmount").innerText,
      pendingRewards: document.getElementById("pendingReward").innerText,
      txCount: txHistory.length
    };

    const prompt = "You are an AI assistant for a USDC payment and staking app on Arc Testnet by Circle.\nAnalyze this wallet data and give 2-3 short actionable suggestions.\nRespond ONLY with a valid JSON array, no markdown, no backticks.\nExample: [{\"icon\":\"💡\",\"text\":\"suggestion here\"}]\nWallet: USDC=" + walletData.usdcBalance + " Staked=" + walletData.stakedAmount + " Rewards=" + walletData.pendingRewards + " Txs=" + walletData.txCount;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer " + OPENROUTER_API_KEY,
  "HTTP-Referer": "https://arc-pay-app.vercel.app",
  "X-Title": "Arc Pay"
},
      body: JSON.stringify({
        model: "google/gemma-3-4b-it:free",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300
      })
    });

    const data = await response.json();
    document.getElementById("aiLoading").style.display = "none";

    if (!data.choices || !data.choices[0]) {
      document.getElementById("aiSuggestions").innerHTML = '<div style="color:var(--red);font-size:12px;">Error: ' + JSON.stringify(data) + '</div>';
      return;
    }

    const text = data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
    const suggestions = JSON.parse(text);

    document.getElementById("aiSuggestions").innerHTML = suggestions.map(function(s) {
      return '<div style="display:flex;align-items:flex-start;gap:12px;background:var(--surface2);border-radius:10px;padding:14px;border:1px solid var(--border);">'
        + '<div style="font-size:24px;flex-shrink:0;">' + s.icon + '</div>'
        + '<div style="font-size:13px;line-height:1.6;color:var(--text);">' + s.text + '</div></div>';
    }).join("");

  } catch (err) {
    document.getElementById("aiLoading").style.display = "none";
    document.getElementById("aiSuggestions").innerHTML = '<div style="color:var(--red);font-size:12px;">Error: ' + err.message + '</div>';
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────
function showStatus(message, type) {
  const el = document.getElementById("status");
  el.innerHTML = message; el.className = type;
}

function showStakingStatus(message, type) {
  const el = document.getElementById("stakingStatus");
  el.innerHTML = message; el.className = type;
  el.style.display = "block";
}

// ─── Animation & UI Enhancements ──────────────────────────────────────────────

// Staggered card entrance animations
function initCardAnimations() {
  const cards = document.querySelectorAll('.card');
  cards.forEach(function(card, index) {
    card.style.animationDelay = (index * 0.1) + 's';
  });
}

// Call on page load
window.addEventListener('DOMContentLoaded', initCardAnimations);

// ─── Mobile Tab Switching ─────────────────────────────────────────────────────

let currentTab = 'send';

function switchTab(tabName) {
  currentTab = tabName;

  // Update active tab indicator
  document.querySelectorAll('.bottom-nav .tab').forEach(function(tab) {
    tab.classList.remove('active');
  });
  const activeTab = document.querySelector('[data-tab="' + tabName + '"]');
  if (activeTab) activeTab.classList.add('active');

  // On mobile, show only the selected section
  if (window.innerWidth < 768) {
    const sections = {
      'send': '#send-section',
      'history': '#history-section',
      'stake': '#stake-section'
    };

    // Hide all sections
    Object.values(sections).forEach(function(selector) {
      const section = document.querySelector(selector);
      if (section) section.style.display = 'none';
    });

    // Show selected section
    const targetSection = document.querySelector(sections[tabName]);
    if (targetSection) {
      targetSection.style.display = 'grid';
      targetSection.style.animation = 'fadeInUp 0.4s ease-out';
    }
  }
}

// Initialize tabs on mobile
if (window.innerWidth < 768) {
  window.addEventListener('load', function() {
    if (document.getElementById('dashboard').style.display === 'block') {
      switchTab('send');
    }
  });
}

// ─── Drawer Control (More Tab) ────────────────────────────────────────────────

function openDrawer() {
  const drawer = document.getElementById('moreDrawer');
  const drawerContent = document.getElementById('drawerContent');

  // Populate drawer with sections not in main tabs
  const addressBook = document.querySelector('#send-section .card:nth-child(2)');
  const faucet = document.getElementById('faucet-section');
  const ai = document.getElementById('ai-section');
  const qr = document.querySelector('#history-section .card:nth-child(2)');

  // Clone sections into drawer
  drawerContent.innerHTML = '';
  if (addressBook) drawerContent.appendChild(addressBook.cloneNode(true));
  if (qr) drawerContent.appendChild(qr.cloneNode(true));
  if (faucet) drawerContent.appendChild(faucet.cloneNode(true));
  if (ai) drawerContent.appendChild(ai.cloneNode(true));

  // Re-attach event listeners to cloned elements
  reattachDrawerListeners();

  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  const drawer = document.getElementById('moreDrawer');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// Reattach event listeners to cloned elements in drawer
function reattachDrawerListeners() {
  // Address book listeners
  const drawerAddContactBtn = document.querySelector('#moreDrawer .btn-secondary');
  if (drawerAddContactBtn && drawerAddContactBtn.innerText.includes('Add Contact')) {
    drawerAddContactBtn.onclick = toggleAddContact;
  }

  // Payment link listeners
  const drawerGenBtn = document.querySelector('#moreDrawer button[onclick*="generatePaymentLink"]');
  if (drawerGenBtn) drawerGenBtn.onclick = generatePaymentLink;

  const drawerCopyBtn = document.querySelector('#moreDrawer button[onclick*="copyPaymentLink"]');
  if (drawerCopyBtn) drawerCopyBtn.onclick = copyPaymentLink;

  // Faucet listeners
  const drawerCopyAddrBtn = document.querySelector('#moreDrawer button[onclick*="copyFaucetAddress"]');
  if (drawerCopyAddrBtn) drawerCopyAddrBtn.onclick = copyFaucetAddress;

  const drawerRefreshBtn = document.querySelector('#moreDrawer button[onclick*="refreshBalances"]');
  if (drawerRefreshBtn) drawerRefreshBtn.onclick = refreshBalances;

  // AI suggestions
  const drawerAIBtn = document.querySelector('#moreDrawer button[onclick*="getAISuggestions"]');
  if (drawerAIBtn) drawerAIBtn.onclick = getAISuggestions;
}

// Swipe down to close drawer (touch gesture)
let touchStartY = 0;

if (document.getElementById('moreDrawer')) {
  const drawer = document.getElementById('moreDrawer');

  drawer.addEventListener('touchstart', function(e) {
    touchStartY = e.touches[0].clientY;
  });

  drawer.addEventListener('touchmove', function(e) {
    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStartY;

    if (diff > 0) {
      drawer.style.transform = 'translateY(' + diff + 'px)';
    }
  });

  drawer.addEventListener('touchend', function(e) {
    const touchY = e.changedTouches[0].clientY;
    const diff = touchY - touchStartY;

    if (diff > 100) {
      closeDrawer();
    } else {
      drawer.style.transform = 'translateY(0)';
    }
  });
}

// Close drawer on escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeDrawer();
  }
});

// ─── Ripple Effect on Button Clicks ───────────────────────────────────────────

function createRipple(event) {
  const button = event.currentTarget;
  const ripple = document.createElement('span');
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  ripple.style.width = size + 'px';
  ripple.style.height = size + 'px';
  ripple.style.left = x + 'px';
  ripple.style.top = y + 'px';
  ripple.classList.add('ripple');

  button.appendChild(ripple);

  ripple.addEventListener('animationend', function() {
    ripple.remove();
  });
}

// Add ripple effect to all primary buttons
window.addEventListener('load', function() {
  document.querySelectorAll('.btn-primary').forEach(function(button) {
    button.addEventListener('click', createRipple);
  });
});

// ─── Loading State Animations ─────────────────────────────────────────────────

// Enhance existing sendToken function with loading state
const originalSendToken = sendToken;
sendToken = async function() {
  const btn = document.querySelector('.btn-primary');
  const originalText = btn ? btn.innerText : '';

  if (btn) {
    btn.innerText = 'Sending...';
    btn.classList.add('loading');
    btn.disabled = true;
  }

  try {
    await originalSendToken();
  } catch (err) {
    // Error handling in original function
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.innerText = originalText;
    }
  }
};

// ─── Scroll-based Animations ──────────────────────────────────────────────────

const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, observerOptions);

// Observe all cards on load
window.addEventListener('load', function() {
  document.querySelectorAll('.card').forEach(function(card) {
    observer.observe(card);
  });
});

// ─── Responsive Handling ──────────────────────────────────────────────────────

// Handle window resize
let resizeTimer;
window.addEventListener('resize', function() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function() {
    // Close drawer when switching to desktop
    if (window.innerWidth >= 768) {
      closeDrawer();

      // Show all sections on desktop
      document.querySelectorAll('#send-section, #history-section, #stake-section, #faucet-section, #ai-section').forEach(function(section) {
        if (section) section.style.display = '';
      });
    } else {
      // Re-initialize mobile view
      if (document.getElementById('dashboard').style.display === 'block') {
        switchTab(currentTab);
      }
    }
  }, 250);
});