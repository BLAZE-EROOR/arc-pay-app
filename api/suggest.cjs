export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse body manually if needed
    let body = req.body;
    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const walletData = body?.walletData;
    if (!walletData) {
      return res.status(400).json({ error: "Missing walletData" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "API key not found" });
    }

    const prompt = `You are an AI assistant for a USDC payment and staking app on Arc Testnet by Circle.
Analyze this wallet data and give 2-3 short actionable suggestions.
Be specific with numbers. Keep each suggestion to 1-2 sentences.
Respond ONLY with a valid JSON array, no markdown, no backticks.
Example: [{"icon":"💡","text":"suggestion here"}]

Wallet Data:
- USDC Balance: ${walletData.usdcBalance}
- EURC Balance: ${walletData.eurcBalance}
- Staked Amount: ${walletData.stakedAmount} USDC
- Pending Rewards: ${walletData.pendingRewards} USDC
- Staking Since: ${walletData.stakingSince}
- Total Transactions: ${walletData.txCount}
- Last Transaction: ${walletData.lastTx}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
        })
      }
    );

    const data = await response.json();
    console.log("Gemini response:", JSON.stringify(data));

    if (!data.candidates || data.candidates.length === 0) {
      return res.status(500).json({ error: "Empty response", detail: data });
    }

    const text = data.candidates[0].content.parts[0].text.trim();
    const clean = text.replace(/```json|```/g, "").trim();
    const suggestions = JSON.parse(clean);

    res.status(200).json({ suggestions });

  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}