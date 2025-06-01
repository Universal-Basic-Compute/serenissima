import React, { useState, useEffect } from 'react';
import { FaSpinner, FaExclamationTriangle } from 'react-icons/fa';

interface AggregatedTransaction {
  type: string;
  totalAmount: number;
  count: number;
}

interface LedgerData {
  debits: AggregatedTransaction[];
  credits: AggregatedTransaction[];
  summary: {
    totalDebits: number;
    totalCredits: number;
    netProfit: number;
  };
}

interface BuildingLedgerProps {
  buildingId: string | null;
  buildingName?: string;
}

const formatDucats = (amount: number): string => {
  return `₫ ${amount.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const BuildingLedger: React.FC<BuildingLedgerProps> = ({ buildingId, buildingName }) => {
  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!buildingId) {
      setLedgerData(null);
      setError(null);
      return;
    }

    const fetchLedgerData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/buildings-economics/${buildingId}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
          throw new Error(errorData.error || `Failed to fetch ledger data: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.success && data.ledger) {
          setLedgerData(data.ledger);
        } else {
          throw new Error(data.error || 'Invalid ledger data format');
        }
      } catch (err) {
        console.error('Error fetching building ledger:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setLedgerData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLedgerData();
  }, [buildingId]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full p-6 bg-amber-50 rounded-lg">
        <FaSpinner className="animate-spin text-amber-700 text-3xl" />
        <p className="ml-3 text-amber-700">Chargement du grand livre...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <div className="flex items-center">
          <FaExclamationTriangle className="text-red-500 mr-2 text-xl" />
          <h4 className="font-semibold">Erreur lors du chargement du grand livre</h4>
        </div>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!ledgerData) {
    return (
      <div className="p-6 bg-amber-50 rounded-lg text-center">
        <p className="text-amber-700 italic">Aucune donnée financière pour ce bâtiment sur les 7 derniers jours.</p>
      </div>
    );
  }

  const { debits, credits, summary } = ledgerData;

  return (
    <div className="ledger-book p-4 bg-gradient-to-b from-[#f4e4c1] to-[#e8d4a7] shadow-lg relative border-4 border-[#8b4513] rounded-lg">
      <style jsx global>{`
        .ledger-book {
          font-family: 'Cinzel', serif;
          color: #1a0f08;
        }
        .ledger-header h1 {
          font-family: 'Cinzel Decorative', cursive;
          font-size: 24px; /* Adjusted for panel */
          color: #8b0000;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
        }
        .ledger-header .subtitle {
          font-size: 14px; /* Adjusted */
          color: #654321;
        }
        .accounts-grid {
          display: grid;
          grid-template-columns: 1fr; /* Single column for smaller panel */
          gap: 20px; /* Reduced gap */
        }
        @media (min-width: 768px) { /* Two columns on larger screens if panel width allows */
          .accounts-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .account-column {
          background: rgba(255,255,255,0.3);
          padding: 15px; /* Reduced padding */
          border: 1px solid #8b4513;
          position: relative;
        }
        .account-column::before {
          content: attr(data-title);
          position: absolute;
          top: -12px; /* Adjusted */
          left: 15px; /* Adjusted */
          background: #f4e4c1;
          padding: 3px 10px; /* Adjusted */
          font-size: 13px; /* Adjusted */
          font-weight: 600;
          color: #8b0000;
          border: 1px solid #8b4513;
        }
        .entry-line {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px; /* Reduced margin */
          padding: 4px 0; /* Reduced padding */
          border-bottom: 1px dashed #8b4513;
          font-size: 12px; /* Adjusted */
        }
        .entry-description {
          flex: 1;
          text-transform: capitalize;
        }
        .entry-amount {
          font-weight: 600;
          color: #654321;
          min-width: 80px; /* Adjusted */
          text-align: right;
        }
        .total-line {
          margin-top: 10px; /* Adjusted */
          padding-top: 10px; /* Adjusted */
          border-top: 2px solid #8b4513;
          font-size: 14px; /* Adjusted */
          font-weight: 600;
        }
        .profit-loss {
          text-align: center;
          margin-top: 15px; /* Adjusted */
          font-size: 16px; /* Adjusted */
          padding: 10px; /* Adjusted */
          background: rgba(139,69,19,0.1);
          border: 1px solid #8b4513; /* Adjusted */
        }
        .profit { color: #2e7d32; }
        .loss { color: #8b0000; }
      `}</style>

      <div className="ledger-header text-center mb-6">
        <h1>Grand Livre: {buildingName || 'Bâtiment'}</h1>
        <div className="subtitle">Période: 7 derniers jours</div>
      </div>

      <div className="accounts-grid mb-6">
        <div className="account-column" data-title="DARE (Dépenses)">
          {debits.length > 0 ? debits.map(d => (
            <div key={`debit-${d.type}`} className="entry-line">
              <span className="entry-description">{d.type.replace(/_/g, ' ')} ({d.count})</span>
              <span className="entry-amount">{formatDucats(d.totalAmount)}</span>
            </div>
          )) : <p className="text-xs italic text-gray-600">Aucune dépense enregistrée.</p>}
          <div className="total-line entry-line">
            <span className="entry-description">Total Dépenses</span>
            <span className="entry-amount">{formatDucats(summary.totalDebits)}</span>
          </div>
        </div>

        <div className="account-column" data-title="HAVERE (Revenus)">
          {credits.length > 0 ? credits.map(c => (
            <div key={`credit-${c.type}`} className="entry-line">
              <span className="entry-description">{c.type.replace(/_/g, ' ')} ({c.count})</span>
              <span className="entry-amount">{formatDucats(c.totalAmount)}</span>
            </div>
          )) : <p className="text-xs italic text-gray-600">Aucun revenu enregistré.</p>}
          <div className="total-line entry-line">
            <span className="entry-description">Total Revenus</span>
            <span className="entry-amount">{formatDucats(summary.totalCredits)}</span>
          </div>
        </div>
      </div>

      <div className={`profit-loss ${summary.netProfit >= 0 ? 'profit' : 'loss'}`}>
        {summary.netProfit >= 0 ? 'Profit Net' : 'Perte Nette'}: {formatDucats(summary.netProfit)}
      </div>
    </div>
  );
};

export default BuildingLedger;
