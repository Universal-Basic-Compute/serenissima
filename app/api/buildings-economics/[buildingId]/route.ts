import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable'; // Importation directe d'Airtable
import { z } from 'zod';
import { subDays, formatISO } from 'date-fns';

const BuildingIdParamsSchema = z.object({
  buildingId: z.string().min(1, "buildingId is required"),
});

interface TransactionRecord {
  id: string;
  fields: {
    Type?: string;
    AssetType?: string;
    Asset?: string;
    Seller?: string;
    Buyer?: string;
    Price?: number;
    ExecutedAt?: string;
    [key: string]: any; // Pour d'autres champs potentiels
  };
}

interface AggregatedTransaction {
  type: string;
  totalAmount: number;
  count: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
): Promise<NextResponse> {
  try {
    const resolvedParams = await params;
    const paramsValidation = BuildingIdParamsSchema.safeParse(resolvedParams);
    if (!paramsValidation.success) {
      return NextResponse.json({ success: false, error: "Invalid buildingId parameter", details: paramsValidation.error.format() }, { status: 400 });
    }
    const { buildingId } = paramsValidation.data;

    // Initialisation d'Airtable
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('Airtable credentials not configured for buildings-economics');
      return NextResponse.json({ success: false, error: 'Airtable credentials not configured' }, { status: 500 });
    }
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    const transactionsTable = base('TRANSACTIONS');
    const sevenDaysAgo = formatISO(subDays(new Date(), 7));

    const filterFormula = `AND({AssetType} = 'building', {Asset} = '${buildingId}', IS_AFTER({ExecutedAt}, '${sevenDaysAgo}'))`;

    console.log(`[API buildings-economics] Fetching transactions for building ${buildingId} with formula: ${filterFormula}`);

    const records = await transactionsTable.select({
      filterByFormula: filterFormula,
      fields: ['Type', 'Seller', 'Buyer', 'Price', 'ExecutedAt'],
      sort: [{ field: 'ExecutedAt', direction: 'desc' }],
    }).all() as unknown as TransactionRecord[];

    console.log(`[API buildings-economics] Found ${records.length} transactions for building ${buildingId}`);

    const debits: Record<string, { totalAmount: number; count: number }> = {};
    const credits: Record<string, { totalAmount: number; count: number }> = {};
    let totalDebitsAmount = 0;
    let totalCreditsAmount = 0;

    records.forEach(record => {
      const type = record.fields.Type || 'Unknown';
      const price = record.fields.Price || 0;

      if (record.fields.Buyer === buildingId) { // Building is the buyer, so it's a debit for the building
        if (!debits[type]) {
          debits[type] = { totalAmount: 0, count: 0 };
        }
        debits[type].totalAmount += price;
        debits[type].count += 1;
        totalDebitsAmount += price;
      } else if (record.fields.Seller === buildingId) { // Building is the seller, so it's a credit for the building
        if (!credits[type]) {
          credits[type] = { totalAmount: 0, count: 0 };
        }
        credits[type].totalAmount += price;
        credits[type].count += 1;
        totalCreditsAmount += price;
      }
    });

    const formattedDebits: AggregatedTransaction[] = Object.entries(debits).map(([type, data]) => ({
      type,
      ...data,
    }));

    const formattedCredits: AggregatedTransaction[] = Object.entries(credits).map(([type, data]) => ({
      type,
      ...data,
    }));
    
    const netProfit = totalCreditsAmount - totalDebitsAmount;

    return NextResponse.json({
      success: true,
      buildingId,
      periodStartDate: sevenDaysAgo,
      periodEndDate: formatISO(new Date()),
      ledger: {
        debits: formattedDebits,
        credits: formattedCredits,
        summary: {
          totalDebits: totalDebitsAmount,
          totalCredits: totalCreditsAmount,
          netProfit: netProfit,
        },
      },
    });

  } catch (error: any) {
    console.error('[API buildings-economics] Error fetching building economics:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch building economics data' }, { status: 500 });
  }
}
