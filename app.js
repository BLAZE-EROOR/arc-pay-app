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