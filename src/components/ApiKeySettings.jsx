import React from "react";

export default function ApiKeySettings() {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">
        AI Settings
      </h2>

      <p className="text-slate-500 mb-6">
        Configure your AI provider before analyzing financial reports.
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            AI Provider
          </label>

          <select
            className="w-full border rounded-xl px-4 py-3"
            disabled
          >
            <option>Google Gemini</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Gemini API Key
          </label>

          <input
            type="password"
            placeholder="AIzaSy..."
            className="w-full border rounded-xl px-4 py-3"
          />
        </div>

        <div className="flex gap-3">
          <button className="px-5 py-3 rounded-xl bg-blue-600 text-white font-medium">
            Save
          </button>

          <button className="px-5 py-3 rounded-xl border">
            Test Connection
          </button>
        </div>
      </div>
    </div>
  );
}