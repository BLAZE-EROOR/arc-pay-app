export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { walletData } = req.body;

  const prompt = `You are an AI assistant for a USDC payment and staking app built on Arc Testnet (by Circle). 
Analyze this user's wallet data and give 2-3 short, actionable smart suggestions.
Be specific with numbers. Be encouraging but honest. Keep each suggestion to 1-2 sentences max.
Format your response as a JSON array of objects with "icon" (emoji) and "text" fields.

Wallet Data:
- USDC Balance: ${walletData.usdcBalance} USDC
- EURC Balance: ${walletData.eurcBalance} EURC
- Staked Amount: ${walletData.stakedAmount} USDC
- Pending Rewards: ${walletData.pendingRewards} USDC
- Staking Since: ${walletData.stakingSince}
- Total Transactions: ${walletData.txCount}
- Last Transaction: ${walletData.lastTx}

Respond ONLY with a valid JSON array, no markdown, no backticks, no other text.
Example: [{"icon":"💡","text":"Your suggestion here"},{"icon":"📈","text":"Another suggestion"}]`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();

    // Log full response for debugging
    console.log("Claude response:", JSON.stringify(data));

    if (!data.content || data.content.length === 0) {
      console.error("Empty content:", data);
      return res.status(500).json({ error: "Empty response from Claude", detail: data });
    }

    const text = data.content[0].text;
    console.log("Claude text:", text);

    // Strip any markdown backticks just in case
    const clean = text.replace(/```json|```/g, "").trim();
    const suggestions = JSON.parse(clean);

    res.status(200).json({ suggestions });
  } catch (err) {
    console.error("Handler error:", err);
    res.status(500).json({ error: err.message });
  }
}