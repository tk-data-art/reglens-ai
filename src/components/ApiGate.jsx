import React, { useState } from "react";

export default function ApiGate({ onConnected }) {
  const [apiKey, setApiKey] = useState(
    localStorage.getItem("reglens_api_key") || ""
  );

  const [showKey, setShowKey] = useState(false);

  const saveKey = () => {
    if (!apiKey.trim()) {
      alert("Please enter your Gemini API key.");
      return;
    }

    localStorage.setItem("reglens_api_key", apiKey.trim());

    onConnected();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">

      <div className="bg-white rounded-3xl shadow-xl p-10 w-full max-w-xl">

        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Welcome to RegLens AI
        </h1>

        <p className="text-slate-600 mb-8">
          Connect your Google Gemini API key to start analyzing annual reports.
        </p>

        <label className="block text-sm font-medium mb-2">
          Gemini API Key
        </label>

        <div className="flex gap-2">

          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIzaSy..."
            className="flex-1 border rounded-xl px-4 py-3"
          />

          <button
            onClick={() => setShowKey(!showKey)}
            className="border rounded-xl px-4"
          >
            {showKey ? "Hide" : "Show"}
          </button>

        </div>

        <button
          onClick={saveKey}
          className="mt-6 w-full bg-blue-600 text-white py-3 rounded-xl font-semibold"
        >
          Connect & Continue
        </button>

        <p className="mt-6 text-sm text-slate-500">
          Your API key is stored only in your browser.
        </p>

      </div>

    </div>
  );
}