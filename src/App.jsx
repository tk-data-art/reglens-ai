
import ApiGate from "./components/ApiGate";
import ApiKeySettings from "./components/ApiKeySettings";
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  UploadCloud, 
  FileText, 
  Building, 
  Calendar, 
  TrendingUp, 
  Briefcase,
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  BarChart3,
  DollarSign,
  PieChart,
  Activity,
  Wallet,
  Calculator,
  LayoutDashboard,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  Target,
  Scale,
  Search,
  Zap,
  Network,
  ArrowDown,
  Database,
  Layers,
  X,
  Maximize,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ArrowRight,
  LineChart,
  Percent
} from 'lucide-react';

const GEMINI_API_KEY = localStorage.getItem("reglens_api_key") || "";

// Architecture configured for Flash and Flash-Lite integration.
const MODELS = {
  DEFAULT: "gemini-3.1-flash-lite",

  EXTRACTION: "gemini-3.1-flash-lite",
  AGENT: "gemini-3.1-flash-lite",

  ANALYST: "gemini-3.1-flash-lite",
  FINDINGS: "gemini-3.1-flash-lite",
  REGULATORY: "gemini-3.1-flash-lite",
  COPILOT: "gemini-3.1-flash-lite"
};

// Helper for API calls with exponential backoff and rate limit handling
const fetchWithRetry = async (url, options, maxRetries = 5) => {
  let retries = 0;
  const delays = [1000, 2000, 4000, 8000, 16000];

  while (retries < maxRetries) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        throw new Error(`API Request failed after ${maxRetries} attempts: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, delays[retries - 1]));
    }
  }
};

// Helper to safely parse JSON from LLM response utilizing brace matching to ignore trailing garbage
const cleanAndParseJSON = (text) => {
  try {
    let cleaned = text.replace(/\u0060\u0060\u0060(?:json)?\n?/gi, '').replace(/\u0060\u0060\u0060/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e1) {
      const startIndex = cleaned.indexOf('{');
      if (startIndex === -1) throw new Error("No JSON object found.");
      let count = 0;
      let endIndex = -1;
      for (let i = startIndex; i < cleaned.length; i++) {
        if (cleaned[i] === '{') count++;
        else if (cleaned[i] === '}') count--;
        if (count === 0) { endIndex = i; break; }
      }
      if (endIndex !== -1) return JSON.parse(cleaned.substring(startIndex, endIndex + 1));
      throw e1;
    }
  } catch (e) {
    console.error("Failed to parse JSON:", text);
    throw new Error("Failed to parse AI response as valid JSON.");
  }
};

// --- GLOBAL CURRENCY REGISTRY ---
const CURRENCY_REGISTRY = {
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN' },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB' },
  EUR: { code: 'EUR', symbol: '€', locale: 'de-DE' },
  JPY: { code: 'JPY', symbol: '¥', locale: 'ja-JP' },
  AED: { code: 'AED', symbol: 'AED ', locale: 'ar-AE' },
  SAR: { code: 'SAR', symbol: 'SAR ', locale: 'ar-SA' },
  CHF: { code: 'CHF', symbol: 'CHF ', locale: 'de-CH' }
};

// --- CENTRALIZED FINANCIAL PRESENTATION SERVICE ---
const FinancialPresentationService = {
  formatFinancial(value, currencyCode) {
    if (value === null || value === undefined || value === 'N/A' || String(value).trim() === '') {
      return 'N/A';
    }

    let num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    if (isNaN(num)) return String(value);

    const config = CURRENCY_REGISTRY[currencyCode] || { symbol: currencyCode + ' ', locale: 'en-US' };
    const abs = Math.abs(num);

    // Indian Locale Formatting (Absolute value strictly to Lakh Cr / Cr / Lakh)
    if (currencyCode === 'INR') {
      if (abs >= 1e12) return `${config.symbol}${(num / 1e12).toFixed(2)} Lakh Cr`;
      if (abs >= 1e7) return `${config.symbol}${(num / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;
      if (abs >= 1e5) return `${config.symbol}${(num / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Lakh`;
      return `${config.symbol}${num.toLocaleString('en-IN')}`;
    }

    // Default T/B/M/K Scaling for all other currencies based solely on absolute magnitude
    let scaled = num;
    let suffix = '';
    if (abs >= 1e12) { scaled = num / 1e12; suffix = 'T'; }
    else if (abs >= 1e9) { scaled = num / 1e9; suffix = 'B'; }
    else if (abs >= 1e6) { scaled = num / 1e6; suffix = 'M'; }
    else if (abs >= 1e3) { scaled = num / 1e3; suffix = 'K'; }

    return `${config.symbol}${scaled.toFixed(1)}${suffix}`;
  },

  formatTooltip(metricName, normalizedValue, currencyCode, reportUnit, page, section, confidence = 'High') {
    const formattedRaw = typeof normalizedValue === 'number' ? normalizedValue.toLocaleString() : normalizedValue;
    return `Metric: ${metricName}\n` +
           `Currency: ${currencyCode}\n` +
           `Reporting Unit: ${reportUnit || 'Absolute'}\n` +
           `Normalized Value: ${formattedRaw}\n` +
           `Source Page: ${page || 'N/A'}\n` +
           `Section: ${section || 'N/A'}\n` +
           `Confidence: ${confidence}`;
  }
};

// --- DYNAMIC CURRENCY & REPORTING DETECTION HELPERS ---
const getCurrencyConfig = (knowledgeStore) => {
  const metaCurrency = knowledgeStore?.metadata?.currency;
  if (metaCurrency) {
    if (typeof metaCurrency === 'object' && metaCurrency.code) {
      return CURRENCY_REGISTRY[metaCurrency.code] || { code: metaCurrency.code, symbol: metaCurrency.symbol || '', locale: metaCurrency.locale || 'en-US' };
    }
    if (typeof metaCurrency === 'string') {
      return CURRENCY_REGISTRY[metaCurrency] || { code: metaCurrency, symbol: '', locale: 'en-US' };
    }
  }
  
  const finData = knowledgeStore?.financialData || {};
  const valuesToScan = [
    finData.revenue, finData.netIncome, finData.operatingIncome, 
    finData.totalAssets, finData.totalLiabilities, finData.shareholdersEquity, finData.cashFlow
  ].filter(Boolean);

  for (const val of valuesToScan) {
    const str = String(val).toUpperCase();
    if (str.includes('₹') || str.includes('INR') || str.includes('RUPEE')) return CURRENCY_REGISTRY.INR;
    if (str.includes('£') || str.includes('GBP')) return CURRENCY_REGISTRY.GBP;
    if (str.includes('€') || str.includes('EUR')) return CURRENCY_REGISTRY.EUR;
    if (str.includes('¥') || str.includes('JPY') || str.includes('YEN')) return CURRENCY_REGISTRY.JPY;
    if (str.includes('AED') || str.includes('د.إ')) return CURRENCY_REGISTRY.AED;
    if (str.includes('$') || str.includes('USD')) return CURRENCY_REGISTRY.USD;
  }
  return { code: 'USD', symbol: '$', locale: 'en-US' };
};

const getReportingConfig = (knowledgeStore) => {
  const metaReporting = knowledgeStore?.metadata?.reporting;
  if (metaReporting) {
    if (typeof metaReporting === 'object' && metaReporting.multiplier) return metaReporting;
  }
  
  const finData = knowledgeStore?.financialData || {};
  const valuesToScan = [
    finData.revenue, finData.netIncome, finData.operatingIncome, 
    finData.totalAssets, finData.totalLiabilities, finData.shareholdersEquity, finData.cashFlow
  ].filter(Boolean);

  for (const val of valuesToScan) {
    const str = String(val).toUpperCase();
    if (str.includes('TRILLION') || str.match(/\bT\b/)) return { unit: 'Billions', multiplier: 1000000000000 };
    if (str.includes('BILLION') || str.includes('BLN') || str.match(/\bB\b/)) return { unit: 'Billions', multiplier: 1000000000 };
    if (str.includes('MILLION') || str.includes('MLN') || str.match(/\bM\b/)) return { unit: 'Millions', multiplier: 1000000 };
    if (str.includes('CRORE') || str.includes('CR')) return { unit: 'Crores', multiplier: 10000000 };
    if (str.includes('LAKH')) return { unit: 'Lakhs', multiplier: 100000 };
    if (str.includes('THOUSAND') || str.match(/\bK\b/)) return { unit: 'Thousands', multiplier: 1000 };
  }
  return { unit: 'Absolute', multiplier: 1 };
};

// --- PRESENTATION ADAPTER ---
const getFinancialMetric = (metricName, knowledgeStore) => {
  const defaultObj = { display: 'N/A', normalizedValue: 0, rawValue: 0, currency: 'USD', reportUnit: 'Absolute', tooltip: 'Not Available', page: 'N/A', section: 'N/A' };
  if (!knowledgeStore || !metricName) return defaultObj;
  
  const { financialData, sourceIndex } = knowledgeStore;
  
  const keyMap = {
    'Total Revenue': 'revenue',
    'Revenue': 'revenue',
    'Net Income': 'netIncome',
    'Operating Income': 'operatingIncome',
    'Total Assets': 'totalAssets',
    'Assets': 'totalAssets',
    'Total Liabilities': 'totalLiabilities',
    'Liabilities': 'totalLiabilities',
    'Shareholders Equity': 'shareholdersEquity',
    'Equity': 'shareholdersEquity',
    'Operating Cash Flow': 'operatingCashFlow',
    'Cash Flow': 'operatingCashFlow'
  };
  
  const normalizedKey = keyMap[metricName] || metricName;

  const info = (sourceIndex || []).find(l => 
    l.metric.toLowerCase().includes(metricName.toLowerCase()) || 
    metricName.toLowerCase().includes(l.metric.toLowerCase())
  ) || {};

  const currencyConfig = getCurrencyConfig(knowledgeStore);
  const reportingConfig = getReportingConfig(knowledgeStore);

  const normalizedData = financialData?.normalized?.[normalizedKey];
  
  let rawVal = normalizedData?.rawValue;
  let normVal = normalizedData?.normalizedValue || normalizedData?.rawValue;
  let pageNum = info.page || normalizedData?.page || 'N/A';
  let sectionName = info.section || normalizedData?.section || 'N/A';
  
  if (rawVal === undefined || rawVal === null) {
    const rawFallbackValue = financialData?.[normalizedKey] || info.value || 'N/A';
    if (rawFallbackValue !== 'N/A') {
      const cleanString = String(rawFallbackValue).replace(/[^0-9.-]/g, '');
      const parsedNum = parseFloat(cleanString);
      if (!isNaN(parsedNum)) {
        rawVal = parsedNum;
        normVal = parsedNum * reportingConfig.multiplier;
      }
    }
  }

  if (rawVal !== undefined && rawVal !== null) {
    const display = FinancialPresentationService.formatFinancial(normVal, currencyConfig.code);
    const tooltip = FinancialPresentationService.formatTooltip(
      metricName,
      normVal,
      currencyConfig.code,
      reportingConfig.unit,
      pageNum,
      sectionName,
      info.confidence || 'High'
    );

    return {
      display,
      normalizedValue: normVal,
      rawValue: rawVal,
      currency: currencyConfig.code,
      reportUnit: reportingConfig.unit,
      tooltip,
      page: pageNum,
      section: sectionName
    };
  }

  return defaultObj;
};

// Utility to apply the centralized formatter across narrative text strings
const formatTextWithFinancials = (text, categoryName, knowledgeStore) => {
  if (!text || typeof text !== 'string') return text;
  
  // High-fidelity regex that consumes the complete financial literal, preventing partial numeric splitting
  const regex = /(?:US\$|\$|₹|£|€|¥|AED\s*)?\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*(?:trillion|billions?|millions?|thousands?|crores?|lakhs?|T|B|M|K|Cr|Lakh))?\b/gi;
  
  const parts = [];
  let lastIdx = 0;
  let match;
  
  const currencyConfig = getCurrencyConfig(knowledgeStore);
  const reportingConfig = getReportingConfig(knowledgeStore);

  while ((match = regex.exec(text)) !== null) {
    parts.push(text.substring(lastIdx, match.index));
    const rawMatch = match[0];
    
    // Isolate only the suffix part to prevent false-positives with currency codes (e.g. 'B' in GBP)
    const suffixMatch = rawMatch.match(/[a-zA-Z\s]+$/);
    const suffixUpper = suffixMatch ? suffixMatch[0].toUpperCase().trim() : "";
    
    let explicitMultiplier = null;
    if (suffixUpper.includes('T') || suffixUpper.includes('TRILLION')) explicitMultiplier = 1e12;
    else if (suffixUpper.includes('B') || suffixUpper.includes('BILLION') || suffixUpper.includes('BILLIONS')) explicitMultiplier = 1e9;
    else if (suffixUpper.includes('M') || suffixUpper.includes('MILLION') || suffixUpper.includes('MILLIONS')) explicitMultiplier = 1e6;
    else if (suffixUpper.includes('K') || suffixUpper.includes('THOUSAND')) explicitMultiplier = 1e3;
    else if (suffixUpper.includes('CRORE') || suffixUpper.includes('CRORES') || suffixUpper === 'CR') explicitMultiplier = 1e7;
    else if (suffixUpper.includes('LAKH') || suffixUpper.includes('LAKHS')) explicitMultiplier = 1e5;

    const numVal = parseFloat(rawMatch.replace(/[^0-9.]/g, ''));
    
    if (numVal > 1900 && numVal < 2100 && explicitMultiplier === null && !rawMatch.match(/[$₹£€¥]|AED/i)) {
       parts.push(rawMatch);
    } else if (explicitMultiplier !== null || numVal >= 1000 || rawMatch.match(/[$₹£€¥]|AED/i)) {
       let displayVal, tooltipVal;
       
       if (categoryName && knowledgeStore) {
         const metricObj = getFinancialMetric(categoryName, knowledgeStore);
         if (metricObj.display !== 'N/A') {
           displayVal = metricObj.display;
           tooltipVal = metricObj.tooltip;
         } else {
           const calculatedVal = numVal * (explicitMultiplier || reportingConfig.multiplier);
           displayVal = FinancialPresentationService.formatFinancial(calculatedVal, currencyConfig.code);
           tooltipVal = FinancialPresentationService.formatTooltip(categoryName, calculatedVal, currencyConfig.code, reportingConfig.unit, 'N/A', 'Text Content');
         }
       } else {
         const calculatedVal = numVal * (explicitMultiplier || reportingConfig.multiplier);
         displayVal = FinancialPresentationService.formatFinancial(calculatedVal, currencyConfig.code);
         tooltipVal = FinancialPresentationService.formatTooltip('Extracted Value', calculatedVal, currencyConfig.code, reportingConfig.unit, 'N/A', 'Text Content');
       }

       parts.push(
         <span key={match.index} className="font-mono font-bold text-blue-700 cursor-help border-b border-dashed border-blue-400" title={tooltipVal}>
           {displayVal}
         </span>
       );
    } else {
       parts.push(rawMatch);
    }
    lastIdx = regex.lastIndex;
  }
  parts.push(text.substring(lastIdx));
  return parts;
};

/* --- MEMOIZED UI COMPONENTS --- */

const StructuredChatResponse = React.memo(({ data, knowledgeStore }) => (
  <div className="flex flex-col gap-6 w-full font-sans">
    {data.executiveSummary && (
      <div className="text-slate-800 text-[15px] font-medium leading-relaxed">
        {formatTextWithFinancials(data.executiveSummary, null, knowledgeStore)}
      </div>
    )}

    {data.keyFindings && data.keyFindings.length > 0 && (
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Key Findings</h4>
        <ul className="space-y-2.5">
          {data.keyFindings.map((finding, i) => (
            <li key={i} className="flex gap-3 text-[14px] text-slate-700 leading-snug items-start">
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-[2px]" />
              <span>{formatTextWithFinancials(finding, null, knowledgeStore)}</span>
            </li>
          ))}
        </ul>
      </div>
    )}

    {data.financialNarrative && data.financialNarrative.length > 0 && (
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Financial Narrative</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.financialNarrative.map((item, i) => {
            const statusColors = {
              improved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              declined: 'bg-red-50 text-red-700 border-red-200',
              stable: 'bg-blue-50 text-blue-700 border-blue-200'
            };
            const statusKey = item.status?.toLowerCase() || 'stable';
            const color = statusColors[statusKey] || 'bg-slate-50 text-slate-700 border-slate-200';
            
            return (
              <div key={i} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-[14px] text-slate-800">{item.category}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${color}`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-[13px] text-slate-600 leading-relaxed">
                  {formatTextWithFinancials(item.description, item.category, knowledgeStore)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {data.risks && data.risks.length > 0 && (
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Risk Assessment</h4>
        <div className="space-y-3">
          {data.risks.map((risk, i) => {
            const severityKey = risk.severity?.toLowerCase() || 'low';
            const isHigh = severityKey === 'high' || severityKey === 'critical';
            const isMed = severityKey === 'medium';
            const badgeColor = isHigh ? 'bg-red-100 text-red-700 border-red-200' : isMed ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200';

            return (
              <div key={i} className="flex gap-4 bg-slate-50 border border-slate-200 p-4 rounded-xl items-start">
                 <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border shrink-0 mt-[1px] ${badgeColor}`}>
                   {risk.severity} Risk
                 </span>
                 <div>
                   <p className="text-[14px] font-bold text-slate-800 leading-none mb-1.5">{formatTextWithFinancials(risk.title, null, knowledgeStore)}</p>
                   <p className="text-[13px] text-slate-600 leading-relaxed">{formatTextWithFinancials(risk.description, null, knowledgeStore)}</p>
                 </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {data.supportingEvidence && data.supportingEvidence.length > 0 && (
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Supporting Evidence</h4>
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-[13px] text-left">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Page</th>
                <th className="px-4 py-2.5 font-semibold">Statement</th>
                <th className="px-4 py-2.5 font-semibold">Section</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {data.supportingEvidence.map((ev, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">Pg {ev.page}</td>
                  <td className="px-4 py-3 text-slate-600">{ev.statement}</td>
                  <td className="px-4 py-3 text-slate-600">{ev.section}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {data.recommendation && (
      <div className="bg-blue-50 border-l-4 border-blue-600 p-5 rounded-r-xl shadow-sm">
        <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Target size={14} className="mb-[1px]"/> Action Required
        </p>
        <p className="text-[14px] text-blue-900 font-medium leading-relaxed">
          {formatTextWithFinancials(data.recommendation, null, knowledgeStore)}
        </p>
      </div>
    )}
  </div>
));

const Sidebar = React.memo(() => (
  <div className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen fixed left-0 top-0 border-r border-slate-800">
    <div className="p-6 flex items-center gap-3 border-b border-slate-800">
      <div className="bg-blue-600 p-2 rounded-lg text-white"><ShieldCheck size={24} /></div>
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">FinSight <span className="text-blue-400">AI</span></h1>
        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mt-0.5">Reporting Copilot</p>
      </div>
    </div>
    <div className="p-4 flex-1">
      <p className="text-xs uppercase font-semibold text-slate-500 mb-4 px-2 tracking-wider">Workspace</p>
      <nav className="space-y-1">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 bg-blue-900/40 text-blue-400 rounded-md font-medium transition-colors">
          <LayoutDashboard size={18} /> Copilot Dashboard
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-md font-medium transition-colors opacity-50 cursor-not-allowed">
          <Briefcase size={18} /> Portfolio View
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-md font-medium transition-colors opacity-50 cursor-not-allowed">
          <Building size={18} /> Entity Profiles
        </button>
      </nav>
    </div>
    <div className="p-6 border-t border-slate-800 text-sm">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center"><User size={16} /></div>
        <div>
          <p className="text-white font-medium">Analyst User</p>
          <p className="text-xs">Corporate Banking</p>
        </div>
      </div>
    </div>
  </div>
));

const UploadView = React.memo(({ handleFileUpload, pdfjsLoaded, status, errorMessage }) => (
  <div className="max-w-6xl mx-auto mt-10 xl:mt-20 flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
    <div className="flex-1 space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100/50 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider shadow-sm">
        <ShieldCheck size={14} /> Enterprise Intelligence
      </div>
      <h1 className="text-4xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
        FinSight <span className="text-blue-600">AI</span>
      </h1>
      <h2 className="text-xl lg:text-2xl font-bold text-slate-700 border-l-4 border-blue-600 pl-4">Agentic Financial Reporting Copilot</h2>
      <p className="text-lg text-slate-600 leading-relaxed max-w-lg">
        Transform annual reports into financial intelligence, ratio analysis, risk insights, regulatory briefs, and executive decision support.
      </p>
      <ul className="space-y-4 pt-2">
        {['Financial Statement Extraction', 'Ratio Analysis', 'Risk Intelligence', 'Regulatory Brief Generation', 'Executive Copilot'].map((feature, idx) => (
          <li key={idx} className="flex items-center gap-3 text-slate-700 font-semibold">
            <div className="bg-blue-600 text-white rounded-full p-0.5 shrink-0 shadow-sm"><CheckCircle2 size={16} /></div> {feature}
          </li>
        ))}
      </ul>
    </div>
    <div className="flex-1 w-full max-w-md relative">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-900 rounded-3xl transform rotate-3 scale-105 opacity-10 shadow-xl blur-lg"></div>
      <div className="bg-white p-8 lg:p-10 rounded-3xl border border-slate-200 shadow-xl text-center relative z-10 flex flex-col items-center justify-center min-h-[420px]">
        <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6 shadow-inner ring-8 ring-white">
          <UploadCloud size={36} />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-4">Upload an Annual Report</h3>
        <div className="flex flex-col gap-4 mb-8 text-left w-full max-w-xs mx-auto text-sm">
          <div>
            <p className="font-bold text-slate-800 mb-1">Supported:</p>
            <ul className="space-y-1 text-slate-600">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span> Annual Reports</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span> 10-K Filings</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span> Financial Statements</li>
            </ul>
          </div>
          <div>
            <p className="font-bold text-slate-800 mb-1">Recommended:</p>
            <p className="text-slate-600">Apple, JPMorgan, HSBC</p>
          </div>
        </div>
        <div className="relative group w-full">
          <input type="file" accept="application/pdf" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" disabled={!pdfjsLoaded} />
          <button disabled={!pdfjsLoaded} className="w-full relative z-10 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-xl font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group-hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0 disabled:cursor-not-allowed">
            {pdfjsLoaded ? <>Upload Annual Report <ChevronRight size={18} /></> : <><Loader2 size={18} className="animate-spin" /> Initializing Engine...</>}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-6 flex items-center justify-center gap-1.5 w-full">
           <ShieldCheck size={14} /> Bank-Grade Encryption
        </p>
        {status === 'error' && (
          <div className="absolute -bottom-16 left-0 right-0 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-left shadow-sm">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <p className="text-sm">{errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  </div>
));

const LoadingView = React.memo(({ status, extractionStats }) => (
  <div className="flex flex-col items-center justify-center h-[60vh]">
    <div className="relative mb-8">
      <div className="w-20 h-20 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
      <div className="absolute inset-0 flex items-center justify-center text-blue-600">
        {(status === 'extracting_text' || status === 'searching_sections') ? <FileText size={24} /> : 
         (status === 'extracting_data') ? <Calculator size={24} /> : 
         (status === 'generating_regulatory') ? <Scale size={24} /> : <Zap size={24} />}
      </div>
    </div>
    <h3 className="text-2xl font-semibold text-slate-800 mb-6">
      {status === 'extracting_text' && "Parsing Entire Document..."}
      {status === 'searching_sections' && "Scanning for Financial Statements..."}
      {status === 'extracting_data' && "Extracting KPI Data Object..."}
      {status === 'calculating_ratios' && "Analyst Agent Computing Ratios..."}
      {status === 'generating_findings' && "Findings Agent Identifying Risks..."}
      {status === 'generating_regulatory' && "Drafting Regulatory Briefing Note..."}
    </h3>
    
    {(status === 'searching_sections' || status === 'extracting_data' || status === 'calculating_ratios' || status === 'generating_findings' || status === 'generating_regulatory') && (
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">Extraction Status</h4>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${extractionStats.statements.length > 0 ? 'text-green-500' : 'text-slate-300'}`}><CheckCircle2 size={18} /></div>
          <div>
            <p className="text-sm font-medium text-slate-800">Financial Statements Found</p>
            {extractionStats.statements.length > 0 ? <p className="text-xs text-slate-500 mt-1">{extractionStats.statements.join(', ')}</p> : <p className="text-xs text-slate-400 mt-1">Scanning pages...</p>}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${extractionStats.pages.length > 0 ? 'text-green-500' : 'text-slate-300'}`}><CheckCircle2 size={18} /></div>
          <div>
            <p className="text-sm font-medium text-slate-800">Pages Identified</p>
            {extractionStats.pages.length > 0 ? <p className="text-xs text-slate-500 mt-1">{extractionStats.pages.length} pages isolated for analysis</p> : <p className="text-xs text-slate-400 mt-1">Waiting for identification...</p>}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${extractionStats.metricsStatus === 'complete' ? 'text-green-500' : extractionStats.metricsStatus === 'extracting' ? 'text-blue-500 animate-pulse' : 'text-slate-300'}`}>
            {extractionStats.metricsStatus === 'extracting' ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">Metrics Extracted</p>
            <p className="text-xs text-slate-500 mt-1">{extractionStats.metricsStatus === 'complete' ? "Financial Data Object populated" : extractionStats.metricsStatus === 'extracting' ? "Parsing precise financial figures..." : "Pending financial data"}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${extractionStats.agentStatus === 'complete' ? 'text-green-500' : extractionStats.agentStatus === 'analyzing' ? 'text-purple-500 animate-pulse' : 'text-slate-300'}`}>
            {extractionStats.agentStatus === 'analyzing' ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">AI Analyst Processing</p>
            <p className="text-xs text-slate-500 mt-1">{extractionStats.agentStatus === 'complete' ? "Ratios computed" : extractionStats.agentStatus === 'analyzing' ? "Calculating metrics..." : "Waiting for data object..."}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${extractionStats.findingsStatus === 'complete' ? 'text-green-500' : extractionStats.findingsStatus === 'generating' ? 'text-amber-500 animate-pulse' : 'text-slate-300'}`}>
            {extractionStats.findingsStatus === 'generating' ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">Findings Agent</p>
            <p className="text-xs text-slate-500 mt-1">{extractionStats.findingsStatus === 'complete' ? "Risks and signals identified" : extractionStats.findingsStatus === 'generating' ? "Evaluating insights..." : "Waiting for ratios..."}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${extractionStats.regulatoryStatus === 'complete' ? 'text-green-500' : extractionStats.regulatoryStatus === 'generating' ? 'text-blue-500 animate-pulse' : 'text-slate-300'}`}>
            {extractionStats.regulatoryStatus === 'generating' ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">Regulatory Agent</p>
            <p className="text-xs text-slate-500 mt-1">{extractionStats.regulatoryStatus === 'complete' ? "Briefing note generated" : extractionStats.regulatoryStatus === 'generating' ? "Drafting formal regulatory report..." : "Waiting for findings..."}</p>
          </div>
        </div>
      </div>
    )}
  </div>
));

const KPICard = React.memo(({ title, metricName, icon: Icon, isPrimary = false, knowledgeStore }) => {
  const metricObj = getFinancialMetric(metricName || title, knowledgeStore);
  return (
    <div className={`p-5 rounded-xl border shadow-sm flex flex-col justify-between h-full ${isPrimary ? 'bg-blue-600 text-white border-blue-700' : 'bg-white border-slate-200 text-slate-800'}`}>
      <div className="flex items-center justify-between mb-4">
        <p className={`text-xs font-semibold uppercase tracking-wider ${isPrimary ? 'text-blue-200' : 'text-slate-500'}`}>{title}</p>
        <div className={`p-2 rounded-lg ${isPrimary ? 'bg-blue-500/50' : 'bg-slate-100'}`}>
          <Icon size={18} className={isPrimary ? 'text-white' : 'text-slate-600'} />
        </div>
      </div>
      <div>
        <h4 className="text-2xl font-bold truncate" title={metricObj.tooltip}>{metricObj.display}</h4>
        {metricObj.page !== 'N/A' && <p className={`text-[10px] mt-2 font-medium ${isPrimary ? 'text-blue-200' : 'text-slate-400'}`}>Source: Page {metricObj.page}</p>}
      </div>
    </div>
  );
});

const DashboardView = React.memo(({ 
  knowledgeStore, extractionStats, resetApp, file, 
  chatMessages, chatInput, setChatInput, isChatting, submitMessage, handleSendMessage, chatEndRef 
}) => {
  const [activeTab, setActiveTab] = useState('summary'); 
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [graphZoom, setGraphZoom] = useState(1);
  const [graphFullscreen, setGraphFullscreen] = useState(false);

  const { metadata: summary, financialData, ratioAnalysis, findings, regulatoryBrief: regulatoryReport, sourceIndex } = knowledgeStore;
  const analystResults = { ratios: ratioAnalysis, insights: findings };

  const totalPagesProcessed = extractionStats.totalPages || 0;
  const statementsFound = extractionStats.statements.length;
  const kpisExtracted = financialData?.dataLineage?.length || 0;
  const ratiosCalculated = Object.values(analystResults?.ratios || {}).filter(r => r.value && r.value !== 'N/A').length;
  const findingsGenerated = analystResults?.insights?.length || 0;

  const expectedKPIs = ['revenue', 'netIncome', 'operatingIncome', 'totalAssets', 'totalLiabilities', 'shareholdersEquity', 'operatingCashFlow'];
  const extractedKPICount = expectedKPIs.filter(k => financialData?.[k] && financialData[k] !== 'N/A').length;
  const coverageScore = expectedKPIs.length ? Math.round((extractedKPICount / expectedKPIs.length) * 100) : 0;

  let confScoreTotal = 0;
  (financialData?.dataLineage || []).forEach(l => {
    if (l.confidence?.toLowerCase() === 'high') confScoreTotal += 100;
    else if (l.confidence?.toLowerCase() === 'medium') confScoreTotal += 50;
  });
  const confidenceScore = financialData?.dataLineage?.length ? Math.round(confScoreTotal / financialData.dataLineage.length) : 0;

  const getLineageInfo = (keyword) => {
    if (!financialData?.dataLineage) return null;
    return financialData.dataLineage.find(l => l.metric.toLowerCase().includes(keyword.toLowerCase()));
  };

  // --- REDESIGNED HIERARCHICAL FINANCIAL INTELLIGENCE MAP DATA ---
  const graphNodes = useMemo(() => {
    if (!knowledgeStore) return [];

    // Hierarchical grouping layers as specified in instructions
    const layers = [
      // Layer 0: Top Line / Revenue
      [
        { id: 'revenue', label: 'Revenue', category: 'primary', icon: DollarSign, key: 'revenue', type: 'Income Statement' }
      ],
      // Layer 1: Income Statement Metrics
      [
        { id: 'operatingIncome', label: 'Operating Income', category: 'primary', icon: Activity, key: 'operatingIncome', type: 'Income Statement' },
        { id: 'netIncome', label: 'Net Income', category: 'primary', icon: PieChart, key: 'netIncome', type: 'Income Statement' }
      ],
      // Layer 2: Balance Sheet & cash flow Metrics
      [
        { id: 'totalAssets', label: 'Total Assets', category: 'balance', icon: Building, key: 'totalAssets', type: 'Balance Sheet' },
        { id: 'totalLiabilities', label: 'Total Liabilities', category: 'balance', icon: Wallet, key: 'totalLiabilities', type: 'Balance Sheet' },
        { id: 'shareholdersEquity', label: 'Shareholders Equity', category: 'balance', icon: ShieldCheck, key: 'shareholdersEquity', type: 'Balance Sheet' },
        { id: 'operatingCashFlow', label: 'Operating Cash Flow', category: 'primary', icon: TrendingUp, key: 'operatingCashFlow', type: 'Cash Flow' }
      ],
      // Layer 3: Ratios
      [
        { id: 'roe', label: 'ROE', category: 'derived', icon: Calculator, key: 'roe', type: 'Ratio Analysis', ratioKey: 'roe' },
        { id: 'roa', label: 'ROA', category: 'derived', icon: Calculator, key: 'roa', type: 'Ratio Analysis', ratioKey: 'roa' },
        { id: 'netMargin', label: 'Net Margin', category: 'derived', icon: Percent, key: 'netMargin', type: 'Ratio Analysis', ratioKey: 'netMargin' },
        { id: 'debtToEquity', label: 'Debt to Equity', category: 'derived', icon: Scale, key: 'debtToEquity', type: 'Ratio Analysis', ratioKey: 'debtToEquity' },
        { id: 'assetTurnover', label: 'Asset Turnover', category: 'derived', icon: LineChart, key: 'assetTurnover', type: 'Ratio Analysis', ratioKey: 'assetTurnover' }
      ],
      // Layer 4: Risk Indicators
      (findings || []).map((finding, idx) => ({
        id: `risk_${idx}`,
        label: finding.title || 'Risk Signal',
        category: 'risk',
        icon: AlertTriangle,
        type: 'Risk Analysis',
        findingData: finding
      })).slice(0, 4),
      // Layer 5: Executive Advisory Recommendation
      [
        { id: 'recommendation', label: 'Executive Advice', category: 'recommendation', icon: Target, key: 'recommendation', type: 'Strategic Advisory' }
      ]
    ];

    // Dimensional parameters expanded by ~35-40% width to prevent crowding
    const canvasWidth = 820; 
    const canvasHeight = 580; 
    const layerSpacing = canvasHeight / layers.length;

    const nodesList = [];
    layers.forEach((layerNodes, layerIdx) => {
      if (!layerNodes || layerNodes.length === 0) return;
      const nodeSpacing = canvasWidth / (layerNodes.length + 1);
      layerNodes.forEach((node, nodeIdx) => {
        nodesList.push({
          ...node,
          x: nodeSpacing * (nodeIdx + 1),
          y: layerSpacing * (layerIdx + 0.5),
          layer: layerIdx
        });
      });
    });

    return nodesList;
  }, [knowledgeStore, findings]);

  const graphEdges = useMemo(() => {
    const edges = [];
    if (graphNodes.length === 0) return [];

    const findNode = (id) => graphNodes.find(n => n.id === id);

    const addEdge = (fromId, toId) => {
      const fromNode = findNode(fromId);
      const toNode = findNode(toId);
      if (fromNode && toNode) {
        edges.push({ from: fromNode, to: toNode, id: `${fromId}-${toId}` });
      }
    };

    // Layer 0 -> Layer 1
    addEdge('revenue', 'operatingIncome');
    addEdge('revenue', 'netIncome');

    // Layer 1 -> Layer 2 / Layer 3
    addEdge('operatingIncome', 'netIncome');
    addEdge('netIncome', 'roe');
    addEdge('netIncome', 'roa');
    addEdge('netIncome', 'netMargin');

    // Layer 2 -> Layer 3
    addEdge('totalAssets', 'roa');
    addEdge('totalAssets', 'assetTurnover');
    addEdge('totalLiabilities', 'debtToEquity');
    addEdge('shareholdersEquity', 'roe');
    addEdge('shareholdersEquity', 'debtToEquity');
    addEdge('operatingCashFlow', 'roe');

    // Layer 3 (Ratios) -> Layer 4 (Risks)
    const riskNodes = graphNodes.filter(n => n.id.startsWith('risk_'));
    riskNodes.forEach((riskNode) => {
      addEdge('roe', riskNode.id);
      addEdge('debtToEquity', riskNode.id);
    });

    // Layer 4 (Risks) -> Layer 5 (Recommendation)
    riskNodes.forEach((riskNode) => {
      addEdge(riskNode.id, 'recommendation');
    });

    if (riskNodes.length === 0) {
      addEdge('roe', 'recommendation');
      addEdge('netMargin', 'recommendation');
      addEdge('debtToEquity', 'recommendation');
    }

    return edges;
  }, [graphNodes]);

  // Click handler state logic: Highlight selected node and its directly connected nodes, fade others
  const { highlightedNodeIds, highlightedEdgeIds, activeNodeDetails } = useMemo(() => {
    if (!selectedGraphNodeId) {
      return { highlightedNodeIds: new Set(), highlightedEdgeIds: new Set(), activeNodeDetails: null };
    }

    const nodeIds = new Set([selectedGraphNodeId]);
    const edgeIds = new Set();
    const connectedNodeLabels = [];

    graphEdges.forEach(edge => {
      if (edge.from.id === selectedGraphNodeId) {
        nodeIds.add(edge.to.id);
        edgeIds.add(edge.id);
        connectedNodeLabels.push(edge.to.label);
      } else if (edge.to.id === selectedGraphNodeId) {
        nodeIds.add(edge.from.id);
        edgeIds.add(edge.id);
        connectedNodeLabels.push(edge.from.label);
      }
    });

    const node = graphNodes.find(n => n.id === selectedGraphNodeId);
    let details = null;

    if (node) {
      const currencyConfig = getCurrencyConfig(knowledgeStore);
      if (node.category === 'primary' || node.category === 'balance') {
        const metricObj = getFinancialMetric(node.id, knowledgeStore);
        const lineageInfo = getLineageInfo(node.id);
        details = {
          name: node.label,
          display: metricObj.display,
          statementType: node.type,
          page: metricObj.page,
          confidence: metricObj.page !== 'N/A' ? 'High' : 'Medium',
          category: node.category === 'primary' ? 'Primary Financial Metric' : 'Balance Sheet Metric',
          description: lineageInfo?.snippet || 'Direct line-item extracted from verified annual statement tables.',
          connected: connectedNodeLabels
        };
      } else if (node.ratioKey) {
        const ratioData = ratioAnalysis?.[node.ratioKey] || {};
        details = {
          name: ratioData.name || node.label,
          display: ratioData.value || 'N/A',
          statementType: 'Ratio Analysis',
          page: 'Calculated Metric',
          confidence: 'High (Formula-driven)',
          category: 'Derived Metric',
          description: ratioData.interpretation || `Evaluates relationship between relevant financial statements. Formula: ${ratioData.formula}`,
          connected: connectedNodeLabels
        };
      } else if (node.findingData) {
        details = {
          name: node.label,
          display: node.findingData.severity + ' Risk Signal',
          statementType: 'Risk Analysis Group',
          page: 'Analyzed Output',
          confidence: 'High (Agent-driven)',
          category: 'Risk Indicator',
          description: node.findingData.whyItMatters || node.findingData.evidence || 'Identified potential variance anomaly or balance risk requiring executive review.',
          connected: connectedNodeLabels
        };
      } else if (node.id === 'recommendation') {
        details = {
          name: 'Executive Advisory Action',
          display: 'Execute Strategic Review',
          statementType: 'Strategic Advisory',
          page: 'Advisory Note',
          confidence: 'High (Agent-driven)',
          category: 'Executive Output',
          description: summary?.highlights?.[0] || 'Strategic advice generated based on comprehensive analysis of risk signals and computed financial margins.',
          connected: connectedNodeLabels
        };
      }
    }

    return {
      highlightedNodeIds: nodeIds,
      highlightedEdgeIds: edgeIds,
      activeNodeDetails: details
    };
  }, [selectedGraphNodeId, graphNodes, graphEdges, knowledgeStore, ratioAnalysis, summary]);

  return (
    <div className="flex gap-6 h-[calc(100vh-6rem)] relative">
      <div className={`flex flex-col overflow-hidden transition-all duration-300 ${activeTab === 'graph' ? 'w-full' : 'w-[55%] shrink-0'}`}>
        
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="text-blue-600" size={28} /> Analysis Results
          </h2>
          <button onClick={resetApp} className="text-sm font-medium text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-md shadow-sm transition-colors">
            Upload New
          </button>
        </div>

        {/* Tab Selection Navigation including 'regulatory' Restored Tab */}
        <div className="flex gap-2 border-b border-slate-200 mb-6 shrink-0 overflow-x-auto custom-scrollbar pb-1">
          {['summary', 'graph', 'financials', 'ratios', 'findings', 'regulatory'].map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSelectedGraphNodeId(null); }}
              className={`px-4 py-3 text-sm font-semibold capitalize whitespace-nowrap transition-all border-b-2 flex items-center gap-2 ${
                activeTab === tab 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab === 'summary' ? 'Executive Summary' : 
               tab === 'graph' ? <><Network size={16} /> Financial Intelligence Map</> :
               tab === 'financials' ? 'Financial Intelligence' : 
               tab === 'ratios' ? 'Ratio Analysis' : 
               tab === 'findings' ? 'AI Findings' : 'Regulatory Assessment'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-2 pb-6 custom-scrollbar relative">
          {summary && (
            <>
              {activeTab === 'summary' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
                      <div className="bg-slate-100 p-3 rounded-lg text-slate-600"><Calendar size={20} /></div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Reporting Period</p>
                        <p className="font-semibold text-slate-900">{summary.period}</p>
                      </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
                      <div className="bg-slate-100 p-3 rounded-lg text-slate-600"><Building size={20} /></div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Industry / Sector</p>
                        <p className="font-semibold text-slate-900">{summary.industry}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Company Overview</h3>
                    <p className="text-slate-800 leading-relaxed text-sm md:text-base">{summary.overview}</p>
                  </div>

                  <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-6 rounded-xl shadow-md text-white">
                    <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-blue-800 pb-2">
                      <TrendingUp size={16} /> Strategic Highlights
                    </h3>
                    <ul className="space-y-4">
                      {summary.highlights.map((highlight, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <ChevronRight size={18} className="shrink-0 text-blue-400 mt-0.5" />
                          <span className="text-slate-100 leading-snug font-medium text-sm md:text-base">{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mt-6">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
                      <Activity size={16} /> Analysis Statistics
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 shadow-sm">
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Pages Processed</p>
                        <p className="text-xl font-extrabold text-slate-800">{totalPagesProcessed}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 shadow-sm">
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Statements Found</p>
                        <p className="text-xl font-extrabold text-slate-800">{statementsFound}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 shadow-sm">
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">KPIs Extracted</p>
                        <p className="text-xl font-extrabold text-slate-800">{kpisExtracted}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 shadow-sm">
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Ratios Calculated</p>
                        <p className="text-xl font-extrabold text-slate-800">{ratiosCalculated}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 shadow-sm">
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Findings Generated</p>
                        <p className="text-xl font-extrabold text-slate-800">{findingsGenerated}</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 shadow-sm">
                        <p className="text-[10px] uppercase font-bold text-blue-400 tracking-wider mb-1">Coverage Score</p>
                        <p className="text-xl font-extrabold text-blue-700">{coverageScore}%</p>
                      </div>
                      <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100 shadow-sm">
                        <p className="text-[10px] uppercase font-bold text-emerald-500 tracking-wider mb-1">Confidence Score</p>
                        <p className="text-xl font-extrabold text-emerald-700">{confidenceScore}%</p>
                      </div>
                    </div>
                  </div>

                  {extractionStats.statementCoverage && (
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mt-6 flex flex-col xl:flex-row gap-8">
                      <div className="flex-1 space-y-5">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
                          <Layers size={16} /> Extraction Coverage
                        </h3>
                        <div className="space-y-3">
                          {[
                            { label: 'Income Statement', data: extractionStats.statementCoverage.incomeStatement },
                            { label: 'Balance Sheet', data: extractionStats.statementCoverage.balanceSheet },
                            { label: 'Cash Flow Statement', data: extractionStats.statementCoverage.cashFlow }
                          ].map((item, idx) => (
                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100 gap-3">
                              <div className="flex-1">
                                <p className="font-bold text-slate-800 text-sm">{item.label}</p>
                                {item.data.status !== 'Found' && (
                                  <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-lg">{item.data.reason}</p>
                                )}
                              </div>
                              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 shadow-sm border ${
                                item.data.status === 'Found' ? 'bg-green-100 text-green-700 border-green-200' :
                                item.data.status === 'Partially Found' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                'bg-red-100 text-red-700 border-red-200'
                              }`}>
                                {item.data.status === 'Found' && <CheckCircle2 size={14} />}
                                {item.data.status === 'Partially Found' && <AlertTriangle size={14} />}
                                {item.data.status === 'Not Found' && <AlertOctagon size={14} />}
                                {item.data.status}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="xl:w-64 bg-slate-50 rounded-xl border border-slate-100 p-6 flex flex-col items-center justify-center text-center shrink-0">
                        <div className="relative">
                          <svg className="w-32 h-32 transform -rotate-90">
                            <circle cx="64" cy="64" r="50" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-200" />
                            <circle cx="64" cy="64" r="50" stroke="currentColor" strokeWidth="12" fill="transparent"
                              strokeDasharray="314" strokeDashoffset={314 - (314 * extractionStats.statementCoverage.percentage) / 100}
                              className={
                                extractionStats.statementCoverage.percentage >= 80 ? "text-green-500 transition-all duration-1000 ease-out" : 
                                extractionStats.statementCoverage.percentage >= 50 ? "text-amber-500 transition-all duration-1000 ease-out" : 
                                "text-red-500 transition-all duration-1000 ease-out"
                              }
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className="text-3xl font-extrabold text-slate-800 leading-none">
                              {extractionStats.statementCoverage.percentage}%
                            </span>
                          </div>
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-6">Coverage Percentage</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* --- TAB: REDESIGNED HIERARCHICAL FINANCIAL INTELLIGENCE MAP --- */}
              {activeTab === 'graph' && (
                <div className={`flex flex-col gap-4 border border-slate-200 bg-slate-50/50 rounded-2xl p-6 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 relative ${graphFullscreen ? 'fixed inset-0 bg-slate-50 z-50 p-8 h-screen' : 'h-[680px]'}`}>
                  
                  {/* Dashboard / Section Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Network className="text-blue-600" size={22} /> Financial Intelligence Map
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">Explore how key financial metrics connect, influence one another, and drive executive insights.</p>
                    </div>

                    {/* Canvas Controls */}
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 p-1 rounded-lg shadow-sm">
                      <button 
                        onClick={() => setGraphZoom(1)} 
                        className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors" 
                        title="Fit View"
                      >
                        <Maximize size={14} />
                      </button>
                      <button 
                        onClick={() => setGraphZoom(z => Math.min(z + 0.1, 1.4))} 
                        className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors" 
                        title="Zoom In"
                      >
                        <ZoomIn size={14} />
                      </button>
                      <button 
                        onClick={() => setGraphZoom(z => Math.max(z - 0.1, 0.6))} 
                        className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors" 
                        title="Zoom Out"
                      >
                        <ZoomOut size={14} />
                      </button>
                      <button 
                        onClick={() => setGraphFullscreen(!graphFullscreen)} 
                        className={`p-1.5 rounded transition-colors ${graphFullscreen ? 'bg-slate-100 text-slate-800 font-bold' : 'hover:bg-slate-100 text-slate-600'}`} 
                        title="Toggle Fullscreen"
                      >
                        <Maximize2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* 3-COLUMN REFACTORED INTERFACE LAYOUT (Bloomberg/Palantir design) */}
                  <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
                    
                    {/* LEFT COLUMN: Vertical process stages serving as hierarchical layout labels */}
                    <div className="w-56 bg-white border border-slate-100 rounded-xl p-4 flex flex-col justify-between py-6 shrink-0 shadow-sm">
                      <div className="space-y-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-3">Analysis Steps</span>
                        {[
                          { index: '01', title: 'Top Line', desc: 'Operating Revenue' },
                          { index: '02', title: 'Income statement', desc: 'Earnings flow & EBIT' },
                          { index: '03', title: 'Balance Sheet', desc: 'Liquidity & Assets' },
                          { index: '04', title: 'Ratios', desc: 'Comparative Metrics' },
                          { index: '05', title: 'Risk & Outlook', desc: 'Agentic Warning Signals' },
                          { index: '06', title: 'Advisory advice', desc: 'Executive Actions' }
                        ].map((stage, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                            <span className="text-[10px] font-extrabold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded leading-none mt-0.5">{stage.index}</span>
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-slate-700 leading-none">{stage.title}</p>
                              <p className="text-[9px] text-slate-400 font-medium truncate mt-0.5">{stage.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="text-[9px] text-slate-500 leading-normal font-semibold">Nodes in this view are organized chronologically downwards from raw transactions to decision parameters.</p>
                      </div>
                    </div>

                    {/* CENTER COLUMN: Expanded canvas drawing area with responsive HTML/SVG interactive layer */}
                    <div className="flex-1 bg-white border border-slate-100 rounded-xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-0">
                      
                      <div className="flex-1 relative overflow-hidden select-none">
                        {/* Interactive Scale Transform Layer */}
                        <div 
                          className="absolute inset-0 transition-transform duration-300 origin-top-left"
                          style={{ transform: `scale(${graphZoom})`, width: '100%', height: '100%' }}
                        >
                          <svg className="absolute inset-0 w-[820px] h-[580px] pointer-events-none z-0">
                            {/* Curved Sigmoidal S-connections */}
                            {graphEdges.map((edge) => {
                              const isHighlighted = highlightedEdgeIds.has(edge.id);
                              const isDimmed = selectedGraphNodeId && !isHighlighted;
                              
                              const midY = (edge.from.y + edge.to.y) / 2;
                              // Horizontal curve algorithm
                              const dPath = `M ${edge.from.x} ${edge.from.y} C ${edge.from.x} ${midY}, ${edge.to.x} ${midY}, ${edge.to.x} ${edge.to.y}`;

                              return (
                                <path
                                  key={edge.id}
                                  d={dPath}
                                  fill="none"
                                  stroke={isHighlighted ? '#3b82f6' : '#f1f5f9'}
                                  strokeWidth={isHighlighted ? 1.5 : 1}
                                  opacity={isDimmed ? 0.15 : 1}
                                  className="transition-all duration-300"
                                />
                              );
                            })}
                          </svg>

                          {/* Absolute HTML-placed Nodes (Metric Cards) */}
                          <div className="absolute inset-0 w-[820px] h-[580px] z-10 pointer-events-none">
                            {graphNodes.map((node) => {
                              const isSelected = selectedGraphNodeId === node.id;
                              const isHighlighted = highlightedNodeIds.has(node.id);
                              const isDimmed = selectedGraphNodeId && !isHighlighted;
                              const Icon = node.icon;
                              
                              // Retrieve actual display value
                              const metricObj = getFinancialMetric(node.id, knowledgeStore);
                              let displayVal = metricObj.display;

                              if (node.ratioKey) {
                                displayVal = ratioAnalysis?.[node.ratioKey]?.value || 'N/A';
                              } else if (node.findingData) {
                                displayVal = node.findingData.severity;
                              } else if (node.id === 'recommendation') {
                                displayVal = 'Advisory';
                              }

                              // Restrict color themes explicitly to requested semantic sets
                              let styleClasses = "border-emerald-200 bg-emerald-50/50 text-emerald-700 shadow-emerald-100/30"; // Green: Primary
                              if (node.category === 'balance') styleClasses = "border-blue-100 bg-blue-50/50 text-blue-700 shadow-blue-100/30"; // Blue: Balance Sheet
                              if (node.category === 'derived') styleClasses = "border-amber-100 bg-amber-50/50 text-amber-700 shadow-amber-100/30"; // Orange/Amber: Derived
                              if (node.category === 'risk') styleClasses = "border-rose-100 bg-rose-50/50 text-rose-700 shadow-rose-100/30"; // Red: Risk
                              if (node.category === 'recommendation') styleClasses = "border-purple-100 bg-purple-50/50 text-purple-700 shadow-purple-100/30"; // Purple: Recommendation

                              return (
                                <div
                                  key={node.id}
                                  onClick={() => setSelectedGraphNodeId(selectedGraphNodeId === node.id ? null : node.id)}
                                  className={`absolute w-36 p-2 rounded-xl border pointer-events-auto cursor-pointer transition-all duration-200 select-none flex flex-col justify-between hover:shadow-md hover:-translate-y-0.5 ${styleClasses} ${
                                    isSelected ? 'ring-2 ring-slate-800/25 border-slate-900 bg-white scale-105 z-20' : ''
                                  } ${isDimmed ? 'opacity-[0.35]' : 'opacity-100'}`}
                                  style={{
                                    left: node.x,
                                    top: node.y,
                                    transform: 'translate(-50%, -50%)',
                                    height: '52px'
                                  }}
                                >
                                  <div className="flex items-center gap-1.5 w-full">
                                    <div className="shrink-0 p-1 bg-white/95 rounded-lg border border-slate-100 shadow-xs">
                                      <Icon size={12} className="shrink-0" />
                                    </div>
                                    <div className="min-w-0 flex-grow">
                                      <p className="text-[8px] font-extrabold uppercase tracking-wider text-slate-500 truncate leading-none">{node.label}</p>
                                      <p className="text-[11px] font-mono font-bold leading-none mt-1 truncate">{displayVal}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                        </div>
                      </div>

                      {/* Map Footer legend */}
                      <div className="p-3 bg-slate-50 border-t border-slate-100 rounded-b-xl flex justify-center gap-5 text-[8px] font-extrabold text-slate-500 uppercase tracking-widest shrink-0">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Primary Financial Metrics</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Balance Sheet Metrics</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Derived Metrics</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"></span> Risk Indicators</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Strategic Output</span>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Metric Details Panel (Renders selected node parameters) */}
                    <div className="w-80 bg-white border border-slate-100 rounded-xl p-5 flex flex-col justify-between shrink-0 shadow-sm min-h-0 overflow-y-auto custom-scrollbar">
                      {activeNodeDetails ? (
                        <div className="space-y-5 animate-in fade-in duration-200">
                          <div>
                            <span className="text-[9px] font-extrabold uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">
                              {activeNodeDetails.category}
                            </span>
                            <h4 className="text-base font-extrabold text-slate-800 mt-2.5 leading-snug">{activeNodeDetails.name}</h4>
                          </div>

                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-150">
                            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Current Value</span>
                            <p className="text-xl font-mono font-black text-slate-800 mt-1.5 leading-none">{activeNodeDetails.display}</p>
                          </div>

                          <div className="space-y-2.5 text-xs text-slate-600 border-t border-b border-slate-100 py-3">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 font-semibold">Financial Statement</span>
                              <span className="text-slate-700 font-bold text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">{activeNodeDetails.statementType}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 font-semibold">Source Page</span>
                              <span className="text-slate-700 font-bold">{activeNodeDetails.page !== 'N/A' && activeNodeDetails.page !== 'Calculated Metric' ? `Page ${activeNodeDetails.page}` : activeNodeDetails.page}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 font-semibold">Confidence Metric</span>
                              <span className="text-slate-700 font-bold">{activeNodeDetails.confidence}</span>
                            </div>
                          </div>

                          <div>
                            <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 block mb-1.5">Description Context</span>
                            <p className="text-xs text-slate-600 leading-relaxed font-medium bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">{activeNodeDetails.description}</p>
                          </div>

                          <div>
                            <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 block mb-1.5">Direct Connections</span>
                            <div className="flex flex-wrap gap-1">
                              {activeNodeDetails.connected.map((item, idx) => (
                                <span key={idx} className="bg-slate-50 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-100">
                                  {item}
                                </span>
                              ))}
                              {activeNodeDetails.connected.length === 0 && (
                                <span className="text-slate-400 italic text-[10px]">No immediate dependents</span>
                              )}
                            </div>
                          </div>

                          {/* Data Lineage Direct Transition Hook */}
                          <button 
                            onClick={() => setActiveTab('financials')}
                            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <Search size={14} /> View in Data Lineage
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                          <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
                            <Network size={20} className="text-slate-400" />
                          </div>
                          <h4 className="font-extrabold text-slate-700 text-sm">Interactive Inspector</h4>
                          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                            Click any node card on the center map to highlight active transactional flow paths, audit sources, and calculate formulas.
                          </p>
                        </div>
                      )}

                      <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
                        <span>Platform Engine v1.0</span>
                        <span>RegLens AI</span>
                      </div>
                    </div>

                  </div>

                </div>
              )}

              {activeTab === 'financials' && financialData && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="grid grid-cols-2 gap-4">
                    <KPICard title="Total Revenue" metricName="revenue" icon={DollarSign} isPrimary={true} knowledgeStore={knowledgeStore} />
                    <KPICard title="Net Income" metricName="netIncome" icon={PieChart} isPrimary={true} knowledgeStore={knowledgeStore} />
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <KPICard title="Operating Income" metricName="operatingIncome" icon={Activity} knowledgeStore={knowledgeStore} />
                    <KPICard title="Total Assets" metricName="totalAssets" icon={Building} knowledgeStore={knowledgeStore} />
                    <KPICard title="Total Liabilities" metricName="totalLiabilities" icon={Wallet} knowledgeStore={knowledgeStore} />
                    <KPICard title="Shareholders Equity" metricName="shareholdersEquity" icon={PieChart} knowledgeStore={knowledgeStore} />
                    <KPICard title="Operating Cash Flow" metricName="operatingCashFlow" icon={TrendingUp} knowledgeStore={knowledgeStore} />
                  </div>
                  
                  {financialData.dataLineage && (
                    <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <Search size={18} className="text-blue-600" /> Data Lineage & Audit Trail
                        </h3>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-200 px-2 py-1 rounded">Source Verification</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b border-slate-200">
                            <tr>
                              <th className="px-5 py-3 font-semibold">Metric</th>
                              <th className="px-5 py-3 font-semibold">Extracted Value</th>
                              <th className="px-5 py-3 font-semibold">Source Page</th>
                              <th className="px-5 py-3 font-semibold">Section Name</th>
                              <th className="px-5 py-3 font-semibold">Confidence</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {financialData.dataLineage.map((item, idx) => {
                              const metricObj = getFinancialMetric(item.metric, knowledgeStore);
                              return (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-5 py-3 font-medium text-slate-900">{item.metric}</td>
                                  <td className="px-5 py-3 text-slate-700 font-mono w-max">{metricObj.display}</td>
                                  <td className="px-5 py-3 text-slate-600 whitespace-nowrap">Page {metricObj.page}</td>
                                  <td className="px-5 py-3 text-slate-600 truncate max-w-[200px]" title={metricObj.section}>{metricObj.section}</td>
                                  <td className="px-5 py-3">
                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                                      item.confidence?.toLowerCase() === 'high' ? 'bg-green-50 text-green-700 border-green-200' :
                                      item.confidence?.toLowerCase() === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                      'bg-red-50 text-red-700 border-red-200'
                                    }`}>
                                      {item.confidence}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Temporary Developer Debug Panel */}
                  <div className="mt-8 bg-slate-900 rounded-xl border border-slate-700 shadow-sm overflow-hidden text-slate-300">
                    <div 
                      className="px-5 py-4 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-colors"
                      onClick={() => setShowDebug(!showDebug)}
                    >
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <Database size={18} className="text-emerald-400" /> Developer Debug Information
                      </h3>
                      <span className="text-xs font-mono bg-slate-700 px-2 py-1 rounded text-slate-300">
                        {showDebug ? 'Hide' : 'Show'}
                      </span>
                    </div>
                    {showDebug && (
                      <div className="p-5 overflow-x-auto">
                        <pre className="text-xs font-mono text-emerald-400 leading-relaxed">
                          {JSON.stringify({
                            currency: knowledgeStore.metadata?.currency,
                            reporting: knowledgeStore.metadata?.reporting,
                            normalizedRevenue: knowledgeStore.financialData?.normalized?.revenue,
                            normalizedNetIncome: knowledgeStore.financialData?.normalized?.netIncome,
                            normalizedTotalAssets: knowledgeStore.financialData?.normalized?.totalAssets,
                            normalizedTotalLiabilities: knowledgeStore.financialData?.normalized?.totalLiabilities,
                            normalizedOperatingCashFlow: knowledgeStore.financialData?.normalized?.operatingCashFlow
                          }, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'ratios' && analystResults && analystResults.ratios && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {Object.values(analystResults.ratios).map((ratio, idx) => (
                    <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row relative">
                      {ratio.missingDataReason || ratio.value === 'N/A' || ratio.value === null ? (
                        <div className="p-6 w-full flex items-start gap-4">
                          <div className="bg-amber-100 p-3 rounded-full text-amber-600 shrink-0 mt-1"><AlertTriangle size={20} /></div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-1">{ratio.name}</h4>
                            <p className="text-slate-600 text-sm leading-relaxed">{ratio.missingDataReason || "The required KPIs could not be reliably extracted from the financial statements to compute this ratio."}</p>
                            <div className="mt-3 flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Attempted Formula:</span>
                              <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">{ratio.formula}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="bg-slate-50 border-r border-slate-200 p-6 md:w-1/3 flex flex-col justify-center items-center text-center relative">
                            <span className={`absolute top-4 left-4 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                              ratio.riskLevel?.toLowerCase() === 'low' ? 'bg-green-100 text-green-700' :
                              ratio.riskLevel?.toLowerCase() === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {ratio.riskLevel} Risk
                            </span>
                            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 mt-4">{ratio.name}</h4>
                            <span className="text-3xl font-extrabold text-blue-600 tracking-tight">{ratio.value}</span>
                          </div>
                          <div className="p-6 md:w-2/3 flex flex-col justify-center gap-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Formula</p>
                                <p className="text-sm text-slate-700 font-mono bg-slate-100 px-2 py-1.5 rounded inline-block">{ratio.formula}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Calculation</p>
                                <p className="text-sm text-slate-800 font-mono bg-blue-50 px-2 py-1.5 rounded border border-blue-100 inline-block truncate max-w-full" title={ratio.calculation}>{ratio.calculation}</p>
                              </div>
                            </div>
                            <div className="pt-3 border-t border-slate-100">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Business Interpretation</p>
                              <p className="text-sm text-slate-800 leading-relaxed">{ratio.interpretation}</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'findings' && analystResults && analystResults.insights && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-600 p-2.5 rounded-lg text-white"><Zap size={24} className="animate-pulse" /></div>
                      <div>
                        <h3 className="text-white font-bold text-lg">AI Agent Analysis</h3>
                        <p className="text-slate-400 text-sm">Automated evaluation of KPIs, ratios, and risk signals.</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                       <span className="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-400 rounded-md text-xs font-bold uppercase">
                         {analystResults.insights.filter(f => f.severity.toLowerCase() === 'critical' || f.severity.toLowerCase() === 'high').length} High Risks
                       </span>
                    </div>
                  </div>

                  {[{ key: 'Positive Signals', icon: TrendingUp, colorClass: 'text-emerald-600', filterMatch: 'positive' },
                    { key: 'Financial Risks', icon: AlertTriangle, colorClass: 'text-amber-600', filterMatch: 'risk' },
                    { key: 'Management Concerns', icon: AlertOctagon, colorClass: 'text-red-600', filterMatch: 'management' },
                    { key: 'Regulatory Attention Areas', icon: Scale, colorClass: 'text-indigo-600', filterMatch: 'regulatory' }
                  ].map(group => {
                    const groupInsights = analystResults.insights.filter(f => f.category?.toLowerCase().includes(group.filterMatch));
                    if (groupInsights.length === 0) return null;
                    return (
                      <div key={group.key} className="space-y-4">
                        <h3 className={`text-sm font-extrabold uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2 ${group.colorClass}`}>
                          <group.icon size={18} /> {group.key}
                        </h3>
                        <div className="space-y-4">
                          {groupInsights.map((finding, idx) => {
                            const severity = finding.severity?.toLowerCase() || 'low';
                            const isCritical = severity === 'critical';
                            const isHigh = severity === 'high';
                            const isMedium = severity === 'medium';
                            const bgColor = isCritical ? 'bg-red-50 border-red-200' : isHigh ? 'bg-amber-50 border-amber-200' : isMedium ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200';
                            const iconColor = isCritical ? 'text-red-600' : isHigh ? 'text-amber-600' : isMedium ? 'text-blue-600' : 'text-slate-600';
                            const badgeColor = isCritical ? 'bg-red-100 text-red-700 border-red-200' : isHigh ? 'bg-amber-100 text-amber-700 border-amber-200' : isMedium ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-200 text-slate-700 border-slate-300';

                            return (
                              <div key={idx} className={`rounded-xl border shadow-sm overflow-hidden ${bgColor}`}>
                                <div className={`px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/50 ${
                                  isCritical ? 'border-red-100' : isHigh ? 'border-amber-100' : isMedium ? 'border-blue-100' : 'border-slate-100'
                                }`}>
                                  <div className="flex items-center gap-3">
                                    <div className={`bg-white p-2 rounded-lg shadow-sm ${iconColor}`}><group.icon size={20} /></div>
                                    <h4 className="font-bold text-slate-900 text-base">{finding.title}</h4>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto ml-11 sm:ml-0">
                                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-md border shadow-sm ${badgeColor}`}>{finding.severity}</span>
                                  </div>
                                </div>
                                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-4">
                                    <div>
                                      <h5 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"><Search size={14} /> Supporting Evidence</h5>
                                      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm text-sm text-slate-800 leading-relaxed font-medium">
                                        {formatTextWithFinancials(finding.evidence, null, knowledgeStore)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="space-y-4">
                                     <div>
                                      <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Reasoning</h5>
                                      <p className="text-sm text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-300">
                                        {formatTextWithFinancials(finding.whyItMatters, null, knowledgeStore)}
                                      </p>
                                    </div>
                                    <div className="pt-2">
                                      <h5 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"><Target size={14} className="text-blue-600" /> Recommended Action</h5>
                                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-900 leading-relaxed font-medium">
                                        {formatTextWithFinancials(finding.action, null, knowledgeStore)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  
                  {analystResults.insights.length === 0 && (
                     <div className="p-8 text-center flex flex-col items-center gap-4 text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm">
                       <div className="bg-slate-100 p-4 rounded-full text-slate-400 font-bold"><CheckCircle2 size={32} /></div>
                       <div>
                         <h4 className="font-bold text-slate-800 text-lg">No Significant Findings</h4>
                         <p className="text-sm max-w-md mx-auto mt-2">The AI agent did not flag any critical risks, unusual trends, or regulatory concerns based on the extracted financial data.</p>
                       </div>
                     </div>
                  )}
                </div>
              )}

              {/* --- TAB: RESTORED REGULATORY ASSESSMENT PAGE --- */}
              {activeTab === 'regulatory' && regulatoryReport && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-full font-serif text-slate-800 relative">
                    <div className="border-b-2 border-slate-900 pb-6 mb-6 flex justify-between items-start">
                      <div>
                        <h1 className="text-2xl font-bold uppercase tracking-wider mb-2">Regulatory Briefing Note</h1>
                        <p className="text-sm font-sans text-slate-500 font-bold">Prepared by: RegLens AI Reporting Agent</p>
                        <p className="text-sm font-sans text-slate-500">Entity: {financialData?.companyName || "N/A"} | Period: {financialData?.reportingYear || summary?.period || "N/A"}</p>
                      </div>
                      <div className="bg-slate-900 text-white p-3 rounded shadow-sm"><Scale size={28} /></div>
                    </div>

                    <div className="mb-8">
                      <h2 className="text-sm font-sans font-bold text-blue-800 uppercase tracking-widest mb-3">1. Executive Summary</h2>
                      <p className="leading-relaxed text-slate-700 font-sans text-sm">
                        {formatTextWithFinancials(regulatoryReport.executiveSummary, null, knowledgeStore)}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                      <div>
                        <h2 className="text-sm font-sans font-bold text-blue-800 uppercase tracking-widest mb-3">2. Financial Highlights</h2>
                        <ul className="list-disc pl-5 space-y-2 text-slate-700 marker:text-blue-500 font-sans text-sm font-semibold">
                          {regulatoryReport.financialHighlights?.map((hl, i) => (
                            <li key={i} className="leading-relaxed">{formatTextWithFinancials(hl, null, knowledgeStore)}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h2 className="text-sm font-sans font-bold text-blue-800 uppercase tracking-widest mb-3">3. Variance Commentary</h2>
                        <p className="leading-relaxed text-slate-700 font-sans text-sm">
                          {formatTextWithFinancials(regulatoryReport.varianceCommentary, null, knowledgeStore)}
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 mb-8 font-sans">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <h2 className="text-sm font-bold text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2 font-bold"><AlertTriangle size={16} /> Risk Indicators</h2>
                          <ul className="space-y-2">
                            {regulatoryReport.riskIndicators?.map((risk, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                <span className="text-amber-500 font-bold">•</span> {formatTextWithFinancials(risk, null, knowledgeStore)}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3 flex items-center gap-2 font-bold"><Search size={16} /> Potential Focus Areas</h2>
                          <ul className="space-y-2">
                            {regulatoryReport.regulatoryFocusAreas?.map((area, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                <span className="text-indigo-500 font-bold">•</span> {formatTextWithFinancials(area, null, knowledgeStore)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                      <h2 className="text-sm font-sans font-bold text-blue-800 uppercase tracking-widest mb-3">6. Recommended Actions</h2>
                      <ul className="list-decimal pl-5 space-y-2 text-slate-700 font-medium font-sans text-sm">
                        {regulatoryReport.recommendedActions?.map((action, i) => (
                          <li key={i} className="leading-relaxed">{formatTextWithFinancials(action, null, knowledgeStore)}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="absolute top-8 right-8 opacity-5"><ShieldCheck size={180} /></div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {activeTab !== 'graph' && (
        <div className="w-[45%] bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                  <Bot size={22} />
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Copilot Chat</h3>
                <p className="text-xs text-slate-500 font-medium truncate max-w-[200px]">Context: {file?.name}</p>
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 bg-blue-100 px-2 py-1 rounded">Agent Active</span>
          </div>

          <div className="flex-1 p-6 overflow-y-auto bg-slate-50/50 custom-scrollbar flex flex-col gap-6">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 ${msg.role === 'user' ? 'bg-slate-800 text-white' : 'bg-blue-600 text-white'}`}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={`p-4 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-slate-800 text-white rounded-tr-sm' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isChatting && (
              <div className="flex gap-4 max-w-[85%]">
                <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center mt-1">
                  <Bot size={16} />
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-200 text-slate-500 rounded-tl-sm flex items-center gap-2 shadow-sm">
                  <Loader2 size={16} className="animate-spin text-blue-600" /> Analyzing...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-slate-200">
            <form onSubmit={handleSendMessage} className="relative">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about ratios, anomalies, or risks..."
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl pl-4 pr-12 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm md:text-base"
                disabled={isChatting}
              />
              <button 
                type="submit"
                disabled={!chatInput.trim() || isChatting}
                className="absolute right-2 top-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
              >
                <Send size={18} />
              </button>
            </form>
            <p className="text-center text-[10px] text-slate-400 mt-2 font-medium">
              AI-generated responses. Always verify data against the original document.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

export default function App() {
  const [pdfjsLoaded, setPdfjsLoaded] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState("");
  const [extractionStats, setExtractionStats] = useState({
    statements: [], pages: [], totalPages: 0, metricsStatus: 'pending', agentStatus: 'pending', findingsStatus: 'pending', regulatoryStatus: 'pending', statementCoverage: null
  });
  
  // Single, optimized persistent knowledge store replacing heavy raw document state
  const [knowledgeStore, setKnowledgeStore] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(
  !!localStorage.getItem("reglens_api_key"));
  const chatEndRef = useRef(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      setPdfjsLoaded(true);
    };
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatting]);

  const extractTextFromPdf = async (file) => {
    if (!window.pdfjsLib) throw new Error("PDF parser not loaded yet.");
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      pages.push({ pageNum: i, text: textContent.items.map(item => item.str).join(' ') });
    }
    return pages;
  };

  const handleFileUpload = useCallback(async (e) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile || uploadedFile.type !== 'application/pdf') {
      setStatus('error');
      setErrorMessage("Please upload a valid PDF file.");
      return;
    }

    setFile(uploadedFile);
    setStatus('extracting_text');
    setErrorMessage("");
    setExtractionStats({ statements: [], pages: [], totalPages: 0, metricsStatus: 'pending', agentStatus: 'pending', findingsStatus: 'pending', regulatoryStatus: 'pending', statementCoverage: null });

    try {
      let allPages = await extractTextFromPdf(uploadedFile);
      setStatus('searching_sections');
      
      const statementKeywords = [
        "consolidated statements of operations", "consolidated balance sheets", "consolidated statements of cash flows",
        "statement of cash flows", "cash flow statement", "statement of operations", "balance sheet"
      ];
      
      let financialPages = [];
      const foundStatements = new Set();
      let hasIncomeStrict = false, hasIncomeWeak = false;
      let hasBalanceStrict = false, hasBalanceWeak = false;
      let hasCashStrict = false, hasCashWeak = false;
      
      allPages.forEach(page => {
        const lowerText = page.text.toLowerCase();
        let isFinancialPage = false;
        
        statementKeywords.forEach(kw => {
          if (lowerText.includes(kw)) {
            isFinancialPage = true;
            foundStatements.add(kw);
          }
        });
        
        if (lowerText.includes("statement of operations") || lowerText.includes("statements of operations") || lowerText.includes("income statement")) hasIncomeStrict = true;
        if (lowerText.includes("balance sheet") || lowerText.includes("balance sheets")) hasBalanceStrict = true;
        if (lowerText.includes("statement of cash flow") || lowerText.includes("statements of cash flow") || lowerText.includes("cash flow statement") || lowerText.includes("cash flows from operating")) hasCashStrict = true;
        if (lowerText.includes("net income") && lowerText.includes("revenue")) hasIncomeWeak = true;
        if (lowerText.includes("total assets") && lowerText.includes("total liabilities")) hasBalanceWeak = true;
        if (lowerText.includes("net cash provided by") || lowerText.includes("net cash generated from")) hasCashWeak = true;
        
        if (isFinancialPage) financialPages.push(page);
      });

      const getCov = (strict, weak, name) => {
        if (strict) return { status: 'Found', reason: '' };
        if (weak) return { status: 'Partially Found', reason: `Strict ${name} header missing, but supporting metrics detected.` };
        return { status: 'Not Found', reason: `Standard ${name} headers and core supporting metrics were not located.` };
      };

      const statementCoverage = {
        incomeStatement: getCov(hasIncomeStrict, hasIncomeWeak, 'Income Statement'),
        balanceSheet: getCov(hasBalanceStrict, hasBalanceWeak, 'Balance Sheet'),
        cashFlow: getCov(hasCashStrict, hasCashWeak, 'Cash Flow Statement'),
        percentage: 0
      };

      let score = 0;
      if (statementCoverage.incomeStatement.status === 'Found') score += 33.33; else if (statementCoverage.incomeStatement.status === 'Partially Found') score += 16.67;
      if (statementCoverage.balanceSheet.status === 'Found') score += 33.33; else if (statementCoverage.balanceSheet.status === 'Partially Found') score += 16.67;
      if (statementCoverage.cashFlow.status === 'Found') score += 33.34; else if (statementCoverage.cashFlow.status === 'Partially Found') score += 16.66;
      statementCoverage.percentage = Math.round(score);

      if (financialPages.length === 0) {
        const fallbackTableKeywords = ["total assets", "total liabilities", "net cash provided by"];
        allPages.forEach(page => {
          if (fallbackTableKeywords.some(kw => page.text.toLowerCase().includes(kw))) {
            financialPages.push(page);
            foundStatements.add("financial tables");
          }
        });
      }

      const formattedStatements = Array.from(foundStatements).map(s => s.replace(/(?:^|\s)\S/g, a => a.toUpperCase())).slice(0, 3);
      if (formattedStatements.length === 0 && financialPages.length > 0) formattedStatements.push("Key Financial Metrics Sections");

      setExtractionStats({
        statements: formattedStatements.length > 0 ? formattedStatements : ["Financial Sections Identified"],
        pages: financialPages.map(p => p.pageNum),
        totalPages: allPages.length,
        metricsStatus: 'extracting', agentStatus: 'pending', findingsStatus: 'pending', regulatoryStatus: 'pending', statementCoverage
      });
      
      setStatus('extracting_data');
      
      let overviewContext = allPages.slice(0, 15).map(p => p.text).join('\n').substring(0, 50000);
      let financialsContext = financialPages.map(p => `[Page ${p.pageNum}] ${p.text}`).join('\n').substring(0, 100000);

      const [overviewData, extractedFinancialData] = await Promise.all([
        generateOverview(overviewContext),
        extractFinancialData(financialsContext)
      ]);

      setExtractionStats(prev => ({ ...prev, metricsStatus: 'complete', agentStatus: 'analyzing' }));
      
      setStatus('calculating_ratios');
      const ratiosResult = await runAnalystAgent(extractedFinancialData);

      setExtractionStats(prev => ({ ...prev, agentStatus: 'complete', findingsStatus: 'generating' }));

      setStatus('generating_findings');
      const findingsResult = await runFindingsAgent(extractedFinancialData, ratiosResult);
      
      // Temporary Debug Logging for AI Insights (Findings)
      console.log("=== RAW AI FINDINGS JSON ===");
      console.log(JSON.stringify(findingsResult, null, 2));

      setExtractionStats(prev => ({ ...prev, findingsStatus: 'complete', regulatoryStatus: 'generating' }));

      setStatus('generating_regulatory');
      const regulatoryResult = await runRegulatoryAgent(extractedFinancialData, ratiosResult, findingsResult);
      
      // Temporary Debug Logging for Regulatory Assessment
      console.log("=== RAW REGULATORY JSON ===");
      console.log(JSON.stringify(regulatoryResult, null, 2));

      setExtractionStats(prev => ({ ...prev, regulatoryStatus: 'complete' }));

      // Store ONLY the required analytical payload in Knowledge Store. No full PDF text.
      setKnowledgeStore({
        metadata: overviewData,
        financialData: extractedFinancialData,
        ratioAnalysis: ratiosResult.ratios,
        findings: findingsResult.insights,
        regulatoryBrief: regulatoryResult,
        sourceIndex: extractedFinancialData.dataLineage // Data lineage now acts as the exact textual sourceIndex snippet map
      });
      
      setStatus('ready');
      setChatMessages([{
        role: 'assistant',
        content: `I've analyzed the report for ${overviewData.period}. I extracted financial KPIs, ran the Analyst and Findings Agents, and generated a final Regulatory Briefing Note. What specific questions do you have about these metrics, operations, or risks?`
      }]);

      // Release temporary extraction memory for garbage collection
      allPages = null;
      financialPages = null;
      overviewContext = null;
      financialsContext = null;

    } catch (error) {
      console.error(error);
      setStatus('error');
      setErrorMessage("Failed to process the document. " + error.message);
    }
  }, []);

  const generateOverview = async (text) => {
    const apiKey = localStorage.getItem("reglens_api_key");

const url =
`https://generativelanguage.googleapis.com/v1beta/models/${MODELS.AGENT}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: `You are an expert corporate financial analyst. Analyze the following document text to extract the executive summary and company metadata details.
      
      CRITICAL - METADATA DETECTION INSTRUCTIONS:
      
      1. COMPANY DOMICILE / COUNTRY: Identify the company's domicile/country of incorporation.
      
      2. CURRENCY DETECTION RULES (Priority Order):
         - Priority 1: Read the title or header of the financial statements (e.g., "All amounts are in Indian Rupees Crores", "Amounts in ₹ Crores", "US$ millions", "GBP millions", "JPY millions").
         - Priority 2: Read the notes accompanying the financial statements.
         - Priority 3: Read page headers and footers.
         - Priority 4: Infer from company domicile ONLY if the report never specifies any currency.
         - NEVER silently default to USD. If currency cannot be determined under any priority, use code "UNKNOWN", symbol "", name "Unknown", and locale "en".
         
      3. REPORTING UNIT DETECTION:
         - Detect whether the reporting unit is: Absolute, Thousands, Millions, Billions, Lakhs, or Crores.
         - Return BOTH the 'unit' name and its mathematical 'multiplier' (Absolute = 1, Thousands = 1000, Millions = 1000000, Billions = 1000000000, Lakhs = 100000, Crores = 10000000).
         - Do not assume Millions.
         
      4. VALIDATION RULE:
         - Before returning the JSON, verify that currency.code, currency.symbol, reporting.unit, and reporting.multiplier are NOT null or default/assumed values without report evidence. If missing, perform another mental scan.
         
      Format your response STRICTLY as a JSON object with the following schema:
      {
        "overview": "A concise 2-3 sentence overview of the company's main business and operations.",
        "period": "The specific reporting period covered by this document.",
        "industry": "The primary industry or sector the company operates in.",
        "highlights": ["Highlight 1", "Highlight 2", "Highlight 3"],
        "country": "The company's domicile/country of incorporation (e.g., United States, India, United Kingdom, Japan).",
        "currency": {
          "code": "ISO 4217 Currency Code (e.g., USD, INR, GBP, EUR, JPY, AED, SAR, CHF). Use 'UNKNOWN' if undetermined.",
          "symbol": "Currency symbol (e.g., $, ₹, £, €, ¥, AED, SAR, CHF). Use '' if undetermined.",
          "name": "Currency name (e.g., US Dollar, Indian Rupee, British Pound, Euro, Japanese Yen, UAE Dirham, Saudi Riyal, Swiss Franc). Use 'Unknown' if undetermined.",
          "locale": "BCP-47 locale (e.g., en-US, en-IN, en-GB, de-DE, ja-JP, ar-AE, ar-SA, de-CH). Use 'en' if undetermined."
        },
        "reporting": {
          "unit": "The unit of presentation (Absolute | Thousands | Millions | Billions | Lakhs | Crores).",
          "multiplier": 1000000
        }
      }

      Ensure the output is ONLY valid JSON.
      
      Document Text:
      ${text}` }] }],
      generationConfig: { responseMimeType: "application/json" }
    };
    const data = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return cleanAndParseJSON(data.candidates[0].content.parts[0].text);
  };

  const extractFinancialData = async (text) => {
    const apiKey = localStorage.getItem("reglens_api_key");

const url =
`https://generativelanguage.googleapis.com/v1beta/models/${MODELS.AGENT}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{
        parts: [{
          text: `You are an expert corporate financial analyst. Analyze ONLY the following extracted financial statement sections from a company's financial report.
          
          STEP 1: Classify the company into one of the following industries:
          - Banking / Financial Services | Technology | Manufacturing | Healthcare | Other
          
          STEP 2: Dynamically detect the company's reporting currency (code, symbol, locale, name) and reporting unit (Absolute, Thousands, Millions, Billions, Lakhs, Crores) and multiplier based on the statement headers, titles, notes, or domicile.
             - Priority 1: Statement headers/titles.
             - Priority 2: Accompanying notes.
             - Priority 3: Page headers/footers.
             - Priority 4: Domicile.
             - Do not default to USD. If unknown, use code "UNKNOWN", symbol "", locale "en".
          
          STEP 3: Extract the requested KPI information into a structured financialData object.
          
          INDUSTRY-SPECIFIC EXTRACTION RULES:
          If Banking / Financial Services:
          - Total Liabilities: Search for "Total liabilities", "Total liabilities and equity", "Total liabilities and stockholders' equity", or "Total liabilities and shareholders' equity". Isolate and extract the liabilities portion.
          - Cash Flow: Search specifically for: 1. Net cash flow from operating activities 2. Net cash provided by operating activities 3. Net change in cash and due from banks 4. Change in cash and cash equivalents 5. Net increase in cash and cash equivalents. Return the closest matching metric.
          If Other Industry:
          - Cash Flow: Extract the most representative operating cash flow metric.
          
          STEP 4: Construct a "normalized" object nested under financialData.
             For each KPI (revenue, netIncome, operatingIncome, totalAssets, totalLiabilities, shareholdersEquity, operatingCashFlow), populate:
             - rawValue: The numeric value exactly as printed/extracted (float, un-scaled, e.g., 394328). If missing, omit or set to null.
             - normalizedValue: The mathematically calculated absolute value (rawValue * reporting multiplier, e.g., 394328 * 1000000 = 394328000000).
             - currency: ISO 4217 code (e.g., USD, INR, GBP).
             - reportUnit: Unit name (Absolute | Thousands | Millions | Billions | Lakhs | Crores).
          
          Format your response STRICTLY as a JSON object with the following schema:
          {
            "companyName": "Extracted Company Name",
            "industryClassification": "Industry",
            "reportingYear": "Extracted Reporting Year/Period",
            "revenue": "Total Revenue / Sales / Net Interest Income (Full raw number, e.g., 394328, or N/A)",
            "netIncome": "Net Income / Profit (Full raw number, or N/A)",
            "operatingIncome": "Operating Income (Full raw number, or N/A)",
            "totalAssets": "Total Assets (Full raw number, or N/A)",
            "totalLiabilities": "Total Liabilities (Full raw number, or N/A)",
            "shareholdersEquity": "Shareholders Equity (Full raw number, or N/A)",
            "operatingCashFlow": "Most representative cash flow metric based on industry rules (Full raw number, or N/A)",
            "sourcePages": { "revenue": "e.g., Page 42", "netIncome": "e.g., Page 42", "assets": "e.g., Page 44", "liabilities": "e.g., Page 44", "equity": "e.g., Page 45", "cashFlow": "e.g., Page 46" },
            "normalized": {
              "revenue": {
                "rawValue": 394328,
                "normalizedValue": 394328000000,
                "currency": "USD",
                "reportUnit": "Millions"
              },
              "netIncome": {
                "rawValue": 99803,
                "normalizedValue": 99803000000,
                "currency": "USD",
                "reportUnit": "Millions"
              },
              "operatingIncome": {
                "rawValue": 119437,
                "normalizedValue": 119437000000,
                "currency": "USD",
                "reportUnit": "Millions"
              },
              "totalAssets": {
                "rawValue": 352755,
                "normalizedValue": 352755000000,
                "currency": "USD",
                "reportUnit": "Millions"
              },
              "totalLiabilities": {
                "rawValue": 272490,
                "normalizedValue": 272490000000,
                "currency": "USD",
                "reportUnit": "Millions"
              },
              "shareholdersEquity": {
                "rawValue": 80265,
                "normalizedValue": 80265000000,
                "currency": "USD",
                "reportUnit": "Millions"
              },
              "operatingCashFlow": {
                "rawValue": 122151,
                "normalizedValue": 122151000000,
                "currency": "USD",
                "reportUnit": "Millions"
              }
            },
            "dataLineage": [
              {
                "metric": "Name of metric (e.g., Revenue, Net Income, Total Assets, etc.)",
                "value": "Extracted raw value",
                "page": "Page number only (e.g., 32)",
                "section": "Source section name",
                "confidence": "High | Medium | Low",
                "snippet": "A very short excerpt (1-3 lines) of the exact raw text showing where this was found."
              }
            ]
          }
          Ensure the output is ONLY valid JSON. If a specific metric cannot be found, use "N/A". CRITICAL: Ensure the 'dataLineage' array contains an entry for EVERY metric extracted above to serve as a complete audit trail. Return the closest matching metric and indicate the source page.
          
          Financial Statement Sections:
          ${text}`
        }]
      }],
      generationConfig: { responseMimeType: "application/json" }
    };
    const data = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return cleanAndParseJSON(data.candidates[0].content.parts[0].text);
  };

  const runAnalystAgent = async (finData) => {
    const apiKey = localStorage.getItem("reglens_api_key");

const url =
`https://generativelanguage.googleapis.com/v1beta/models/${MODELS.AGENT}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{
        parts: [{
          text: `You are a Financial Analyst Agent. Your input is ONLY the following extracted financialData object. Do NOT invent data. Input financialData: ${JSON.stringify(finData, null, 2)}
          Responsibilities: Calculate ROE, ROA, Net Profit Margin, Debt to Equity Ratio, Asset Turnover Ratio.
          Return your analysis STRICTLY as a JSON object matching this schema exactly:
          { "ratios": { "roe": { "name": "Return on Equity", "formula": "Net Income / Shareholders' Equity", "calculation": "The actual numbers you used (e.g., '$50M / $200M'). Use N/A if missing.", "value": "calculated value (e.g., 25%) or N/A", "interpretation": "Brief business interpretation of what this result means.", "riskLevel": "Low, Medium, or High", "missingDataReason": "If required KPI is missing, explicitly state why." }, "roa": { "name": "Return on Assets", "formula": "Net Income / Total Assets", "calculation": "actual numbers used", "value": "calculated value", "interpretation": "business interpretation", "riskLevel": "Low, Medium, or High", "missingDataReason": "reason if missing, else null" }, "netMargin": { "name": "Net Profit Margin", "formula": "Net Income / Revenue", "calculation": "actual numbers used", "value": "calculated value", "interpretation": "business interpretation", "riskLevel": "Low, Medium, or High", "missingDataReason": "reason if missing, else null" }, "debtToEquity": { "name": "Debt to Equity Ratio", "formula": "Total Liabilities / Shareholders' Equity", "calculation": "actual numbers used", "value": "calculated value (e.g., 1.2x)", "interpretation": "business interpretation", "riskLevel": "Low, Medium, or High", "missingDataReason": "reason if missing, else null" }, "assetTurnover": { "name": "Asset Turnover Ratio", "formula": "Revenue / Total Assets", "calculation": "actual numbers used", "value": "calculated value (e.g., 0.8x)", "interpretation": "business interpretation", "riskLevel": "Low, Medium, or High", "missingDataReason": "reason if missing, else null" } } }`
        }]
      }],
      generationConfig: { responseMimeType: "application/json" }
    };
    const data = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return cleanAndParseJSON(data.candidates[0].content.parts[0].text);
  };

  const runFindingsAgent = async (finData, analystResults) => {
    const apiKey = localStorage.getItem("reglens_api_key");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.AGENT}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        parts: [{
          text: `You are an AI Findings Agent. Your input is ONLY the following financialData and analystResults objects. Do NOT reprocess any generic document text or invent data.
          Input financialData: ${JSON.stringify(finData, null, 2)} Input analystResults (Ratios): ${JSON.stringify(analystResults, null, 2)}
          Responsibilities: Analyze Revenue, Net Income, Assets, Liabilities, Equity, Cash Flow. Identify findings in: 1. Positive Signals 2. Financial Risks 3. Management Concerns 4. Regulatory Attention Areas.
          Return your analysis STRICTLY as a JSON object matching this schema exactly:
          { "insights": [ { "category": "Positive Signal | Financial Risk | Management Concern | Regulatory Attention Area", "severity": "Critical | High | Medium | Low", "title": "Specific, actionable title of the finding.", "evidence": "Concrete evidence citing specific extracted KPIs or calculated ratios.", "whyItMatters": "Why this specific finding is important to the financial health or operations of the business.", "action": "A specific recommended action for an analyst or stakeholder to take based on this finding." } ] }`
        }]
      }],
      generationConfig: { responseMimeType: "application/json" }
    };
    const data = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return cleanAndParseJSON(data.candidates[0].content.parts[0].text);
  };

  const runRegulatoryAgent = async (finData, analystResults, findings) => {
    const apiKey = localStorage.getItem("reglens_api_key");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.AGENT}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{
        parts: [{
          text: `You are a Regulatory Reporting Agent. Your input is ONLY the following JSON data. Input financialData: ${JSON.stringify(finData)} Input analystResults: ${JSON.stringify(analystResults)} Input findings: ${JSON.stringify(findings)}
          Responsibilities: Generate a formal Regulatory Briefing Note based on these inputs. MAXIMUM LENGTH: 500 words total across all fields. Be extremely concise, objective, and professional.
          Return your analysis STRICTLY as a JSON object matching this schema exactly:
          { "executiveSummary": "Concise executive summary of the regulatory posture.", "financialHighlights": ["Highlight 1", "Highlight 2"], "varianceCommentary": "Commentary on notable variances or anomalies.", "riskIndicators": ["Risk Indicator 1", "Risk Indicator 2"], "regulatoryFocusAreas": ["Focus Area 1", "Focus Area 2"], "recommendedActions": ["Action 1", "Action 2"] }`
        }]
      }],
      generationConfig: { responseMimeType: "application/json" }
    };
    const data = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return cleanAndParseJSON(data.candidates[0].content.parts[0].text);
  };

  const submitMessage = useCallback(async (messageText) => {
    if (!messageText.trim() || isChatting || !knowledgeStore) return;

    const userMsg = messageText.trim();
    setChatInput("");
    const newHistory = [...chatMessages, { role: 'user', content: userMsg }];
    setChatMessages(newHistory);
    setIsChatting(true);

    const apiKey = localStorage.getItem("reglens_api_key");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.AGENT}:generateContent?key=${apiKey}`;

    const structuredKnowledge = JSON.stringify(knowledgeStore);

    const geminiContents = [
      {
        role: "user",
        parts: [{ text: `You are FinSight AI Executive Copilot. Never answer as a conversational chatbot. Always respond like a Senior Financial Analyst working in Big 4 (KPMG, BCG, DELOITTE, PWC, EY) preparing an executive briefing.
        
        PRIMARY KNOWLEDGE SOURCE (Structured Data):
        ${structuredKnowledge}
        
        CRITICAL INSTRUCTIONS:
        1. PRIORITIZE STRUCTURED DATA: Answer user questions using the PRIMARY KNOWLEDGE SOURCE JSON.
        2. SOURCE INDEX: Only retrieve a snippet from the 'sourceIndex' when the user asks to show the exact table, original text, where a number came from, page reference, or source evidence.
        3. EFFICIENCY: Provide highly concise, direct answers to reduce token generation and response latency.
        4. Return strictly valid JSON.
        5. Follow this JSON schema exactly:
        {
          "executiveSummary": "2-3 sentences summarizing the answer.",
          "keyFindings": ["Finding 1", "Finding 2"],
          "financialNarrative": [
            {
              "category": "Revenue | Profitability | Capital Structure | Liquidity | Cash Flow | Assets | Liabilities | Shareholder Returns | Strategy",
              "status": "Improved | Declined | Stable",
              "description": "Explanation using evidence from extracted data."
            }
          ],
          "risks": [
            { "severity": "High | Medium | Low", "title": "Risk title", "description": "Risk description" }
          ],
          "supportingEvidence": [
            { "page": "Page number", "statement": "Financial Statement", "section": "Source Section" }
          ],
          "recommendation": "Concise conclusion and recommended action."
        }
        
        6. Do not include markdown characters (like *, #, **) in the text strings.
        7. Ensure the response is concise and executive-friendly.` }]
      },
      {
        role: "model",
        parts: [{ text: `{"executiveSummary": "Understood. I will operate strictly as a Big 4 Senior Financial Analyst. I will use the mandated JSON schema and answer purely based on the structured data provided.", "keyFindings": ["Ready to analyze data.", "Awaiting user queries."], "financialNarrative": [], "risks": [], "supportingEvidence": [], "recommendation": "Please provide your query."}` }]
      }
    ];

    newHistory.forEach(msg => {
      geminiContents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    });

    try {
      const data = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: geminiContents,
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const responseText = data.candidates[0].content.parts[0].text;
      let parsedContent;
      try {
        parsedContent = cleanAndParseJSON(responseText);
      } catch(e) {
        parsedContent = responseText; 
      }
      setChatMessages(prev => [...prev, { role: 'assistant', content: parsedContent }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error while processing your request. Please try again." }]);
    } finally {
      setIsChatting(false);
    }
  }, [chatMessages, isChatting, knowledgeStore]);

  const handleSendMessage = useCallback((e) => {
    e.preventDefault();
    submitMessage(chatInput);
  }, [chatInput, submitMessage]);

  const resetApp = useCallback(() => {
    setFile(null);
    setKnowledgeStore(null);
    setChatMessages([]);
    setStatus('idle');
    setExtractionStats({ statements: [], pages: [], totalPages: 0, metricsStatus: 'pending', agentStatus: 'pending', findingsStatus: 'pending', regulatoryStatus: 'pending', statementCoverage: null });
  }, []);
  
if (!apiConfigured) {
  return (
    <ApiGate
      onConnected={() => {
        setApiConfigured(true);
      }}
    />
  );
}

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans selection:bg-blue-200">
      <Sidebar />
      <main className="flex-1 ml-64 p-8">
        {status === 'idle' && <UploadView handleFileUpload={handleFileUpload} pdfjsLoaded={pdfjsLoaded} status={status} errorMessage={errorMessage} />}
        {status !== 'idle' && status !== 'ready' && <LoadingView status={status} extractionStats={extractionStats} />}
        {status === 'ready' && knowledgeStore && (
          <DashboardView 
            knowledgeStore={knowledgeStore} 
            extractionStats={extractionStats} 
            resetApp={resetApp} 
            file={file} 
            chatMessages={chatMessages} 
            chatInput={chatInput} 
            setChatInput={setChatInput} 
            isChatting={isChatting} 
            submitMessage={submitMessage} 
            handleSendMessage={handleSendMessage} 
            chatEndRef={chatEndRef} 
          />
        )}
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInFromBottom { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-in.fade-in { animation: fadeIn 0.3s ease-out forwards; }
        .animate-in.slide-in-from-bottom-2 { animation: slideInFromBottom 0.3s ease-out forwards; }
      `}} />
    </div>
  );
}