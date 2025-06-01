import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { getComputeBalance, deductCompute } from '@/lib/utils/computeUtils';

// Configure Airtable
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

// Define proper types for Airtable
type AirtableRecord = {
  id: string;
  fields: Record<string, any>;
  get(field: string): any;
};

type AirtableTable = {
  select(options: any): {
    eachPage(
      callback: (records: AirtableRecord[], fetchNextPage: () => void) => void,
      done: (error: Error | null) => void
    ): void;
    firstPage(callback: (err: Error | null, records: AirtableRecord[]) => void): void;
  };
  create(
    fields: Record<string, any>,
    callback: (err: Error | null, record: AirtableRecord) => void
  ): void;
  update(
    records: Array<{id: string, fields: Record<string, any>}>,
    callback: (err: Error | null, records: AirtableRecord[]) => void
  ): void;
};

// Define type for Airtable base
interface AirtableBase {
  (tableName: string): any;
  select(options: any): any;
}

// Initialize Airtable base if API key and base ID are available
const base = apiKey && baseId ? new Airtable({ apiKey }).base(baseId) : null;

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.type) {
      return NextResponse.json(
        { success: false, error: 'Building type is required' },
        { status: 400 }
      );
    }
    
    if (!data.land_id) {
      return NextResponse.json(
        { success: false, error: 'Land ID is required' },
        { status: 400 }
      );
    }
    
    if (!data.position) {
      return NextResponse.json(
        { success: false, error: 'Position is required' },
        { status: 400 }
      );
    }
    
    if (!data.walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    // Check if Airtable is configured
    if (!base) {
      console.warn('Airtable not configured, using mock data');
      
      // Return mock data for development
      const buildingId = `building-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const building = {
        id: buildingId,
        type: data.type,
        land_id: data.land_id,
        variant: data.variant || 'model',
        position: data.position,
        rotation: data.rotation || 0,
        owner: data.walletAddress,
        created_at: data.created_at || new Date().toISOString(),
        cost: data.cost || 0
      };
      
      return NextResponse.json({ 
        success: true, 
        building,
        message: 'Building created successfully (mock)'
      });
    }
    
    // Check if the building point is already occupied
    const existingBuildings = await new Promise<any[]>((resolve, reject) => {
      const buildings: any[] = [];
      
      (base as unknown as AirtableBase).select({
        filterByFormula: `{Land} = '${data.land_id}'`,
        view: 'Grid view'
      })
      .eachPage(
        function page(records, fetchNextPage) {
          records.forEach(record => {
            try {
              const position = JSON.parse(record.get('Position') as string);
              
              // Check if position matches (with some tolerance)
              const tolerance = 0.5; // 0.5 units tolerance
              const positionMatches = 
                Math.abs(position.x - data.position.x) < tolerance &&
                Math.abs(position.z - data.position.z) < tolerance;
              
              if (positionMatches) {
                buildings.push(record);
              }
            } catch (e) {
              console.error('Error parsing position:', e);
            }
          });
          
          fetchNextPage();
        },
        function done(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(buildings);
        }
      );
    });
    
    if (existingBuildings.length > 0) {
      return NextResponse.json(
        { success: false, error: 'This building point is already occupied' },
        { status: 400 }
      );
    }
    
    // Check compute balance
    const computeBalance = await getComputeBalance(data.walletAddress);
    
    if (computeBalance < data.cost) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Insufficient compute balance. You have ${computeBalance} but need ${data.cost}.` 
        },
        { status: 400 }
      );
    }
    
    // Instead of deducting compute, update the citizen's Ducats balance
    try {
      // Get the citizen record from Airtable
      const citizenRecord = await new Promise((resolve, reject) => {
        if (!base) {
          reject(new Error('Airtable not configured'));
          return;
        }
        
        (base!('CITIZENS') as unknown as AirtableTable).select({
          filterByFormula: `{WalletAddress} = '${data.walletAddress}'`
        }).firstPage((err, records) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (records && records.length > 0) {
            resolve(records[0]);
          } else {
            reject(new Error('Citizen not found'));
          }
        });
      });

      // Update the citizen's Ducats balance
      const currentDucats = (citizenRecord as AirtableRecord).get('Ducats') || 0;
      const newDucats = currentDucats - data.cost;

      if (newDucats < 0) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Insufficient Ducats balance. You have ${currentDucats} but need ${data.cost}.` 
          },
          { status: 400 }
        );
      }

      // Update the citizen's Ducats balance
      await new Promise((resolve, reject) => {
        (base!('CITIZENS') as unknown as AirtableTable).update([
          {
            id: (citizenRecord as AirtableRecord).id,
            fields: {
              Ducats: newDucats
            }
          }
        ], function(err, records) {
          if (err) {
            reject(err);
            return;
          }
          resolve(records);
        });
      });

      // Also add Ducats to ConsiglioDeiDieci
      try {
        const consiglioDeiDieciRecord = await new Promise((resolve, reject) => {
          (base!('CITIZENS') as unknown as AirtableTable).select({
            filterByFormula: `{Username} = 'ConsiglioDeiDieci'`
          }).firstPage((err, records) => {
            if (err) {
              reject(err);
              return;
            }
            
            if (records && records.length > 0) {
              resolve(records[0]);
            } else {
              reject(new Error('ConsiglioDeiDieci citizen not found'));
            }
          });
        });

        // Update ConsiglioDeiDieci's Ducats balance
        const currentConsiglioDucats = (consiglioDeiDieciRecord as AirtableRecord).get('Ducats') || 0;
        const newConsiglioDucats = currentConsiglioDucats + data.cost;

        await new Promise((resolve, reject) => {
          (base!('CITIZENS') as unknown as AirtableTable).update([
            {
              id: (consiglioDeiDieciRecord as AirtableRecord).id,
              fields: {
                Ducats: newConsiglioDucats
              }
            }
          ], function(err, records) {
            if (err) {
              reject(err);
              return;
            }
            resolve(records);
          });
        });
      } catch (consiglioDeiDieciError) {
        console.warn('Error updating ConsiglioDeiDieci balance:', consiglioDeiDieciError);
        // Continue even if we couldn't update ConsiglioDeiDieci
      }
    } catch (citizenBalanceError) {
      console.warn('Error updating citizen balance, falling back to deductCompute:', citizenBalanceError);
      // Fallback to deducting compute if Airtable update fails
      await deductCompute(data.walletAddress, data.cost);
    }
    
    // Ensure position is properly formatted as a string
    const positionString = typeof data.position === 'string' 
      ? data.position 
      : JSON.stringify(data.position);
    
    // Create a record in Airtable
    const buildingId = `building-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    // Fetch building type definition to get constructionMinutes, category, and constructionCosts
    let constructionMinutes = 1440; // Default to 1 day (1440 minutes)
    let buildingCategory = "business"; // Default category
    let constructionCostsForContract: Record<string, any> = {}; // To store construction costs for the contract notes

    try {
      const buildingTypesUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/building-types`;
      const typesResponse = await fetch(buildingTypesUrl);
      if (typesResponse.ok) {
        const typesData = await typesResponse.json();
        const typeDef = typesData.buildingTypes?.find((bt: any) => bt.type === data.type);
        if (typeDef) {
          if (typeDef.constructionMinutes) {
            constructionMinutes = typeDef.constructionMinutes;
          }
          if (typeDef.category) {
            buildingCategory = typeDef.category;
          }
          if (typeDef.constructionCosts) { // Get the full constructionCosts object
            constructionCostsForContract = typeDef.constructionCosts;
          }
        }
      } else {
        console.warn(`Failed to fetch building types for ${data.type}. Status: ${typesResponse.status}. Using defaults.`);
      }
    } catch (e) {
      console.warn(`Error fetching building types for ${data.type}:`, e, ". Using defaults.");
    }

    const newBuildingRecord = await new Promise<AirtableRecord>((resolve, reject) => {
      (base!('BUILDINGS') as unknown as AirtableTable).create({
        BuildingId: buildingId,
        Type: data.type,
        LandId: data.land_id, // Ensure field name matches Airtable schema (LandId vs Land)
        Variant: data.variant || 'model',
        Position: positionString,
        Rotation: data.rotation || 0,
        Owner: data.walletAddress, // Assuming walletAddress maps to a Citizen's Username or a field linked to it
        RunBy: data.walletAddress, // Initially, owner is also the operator
        Category: buildingCategory, // Set category
        IsConstructed: false,
        ConstructionDate: null,
        ConstructionMinutesRemaining: constructionMinutes,
        CreatedAt: data.created_at || new Date().toISOString(),
        Cost: data.cost || 0 // Cost of placing the plot, not construction material cost
      }, function(err, record) {
        if (err) {
          console.error('Error creating building record in Airtable:', err);
          reject(err);
          return;
        }
        resolve(record as AirtableRecord);
      });
    });

    // After successfully creating the building record, create a construction_project contract
    try {
      const constructionWorkshops = await new Promise<AirtableRecord[]>((resolve, reject) => {
        (base!('BUILDINGS') as unknown as AirtableTable).select({
          filterByFormula: "AND({SubCategory}='construction', {IsConstructed}=TRUE())",
          fields: ["BuildingId", "RunBy", "Owner"] // Only fetch necessary fields
        }).firstPage((err, records) => {
          if (err) reject(err);
          else resolve(records || []);
        });
      });

      // Déclaration de actualConstructionMaterialCost déplacée ici
      const actualConstructionMaterialCost = constructionCostsForContract.ducats || 0;

      if (constructionWorkshops.length > 0) {
        // Simple selection logic: pick a random workshop. Could be more sophisticated.
        const selectedWorkshop = constructionWorkshops[Math.floor(Math.random() * constructionWorkshops.length)];
        const sellerBuildingId = selectedWorkshop.fields.BuildingId;
        const sellerUsername = selectedWorkshop.fields.RunBy || selectedWorkshop.fields.Owner;

        if (sellerBuildingId && sellerUsername) {
          const notesPayload = {
            constructionCosts: constructionCostsForContract, // Use the fetched construction costs
            originalRequest: `Player ${data.walletAddress} building ${data.type}`
          };
          const contractPayload = {
            ContractId: `construct-${buildingId}-${sellerBuildingId.replace(/[^a-zA-Z0-9-]/g, '')}`,
            Type: "construction_project",
            Buyer: data.walletAddress, // The player initiating construction
            Seller: sellerUsername,    // Operator of the construction workshop
            BuyerBuilding: buildingId, // The new building being constructed
            SellerBuilding: sellerBuildingId,
            Status: "pending_materials",
            Notes: JSON.stringify(notesPayload), // Store constructionCosts in Notes
            PricePerResource: actualConstructionMaterialCost, // Cost of materials/labor for the project
            ResourceType: data.type, // Type of building being constructed
            TargetAmount: 1, // One project
            CreatedAt: new Date().toISOString(),
            EndAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days validity
          };
          await new Promise((resolve, reject) => {
            (base!('CONTRACTS') as unknown as AirtableTable).create(contractPayload, (err, contractRecord) => {
              if (err) reject(err);
              else resolve(contractRecord);
            });
          });
          console.log(`Construction project contract created for ${buildingId} assigned to workshop ${sellerBuildingId}`);
        } else {
          console.warn(`Selected workshop ${selectedWorkshop.id} missing BuildingId or Operator. Cannot create construction contract.`);
        }
      } else {
        console.warn("No available construction workshops found. Cannot create construction_project contract.");
      }
    } catch (contractError) {
      console.error('Error creating construction_project contract:', contractError);
      // Non-fatal, building is created, but construction won't start automatically via this contract.
    }
    
    // Transform the Airtable record to our format
    const typedRecord = newBuildingRecord as any; // Use the newBuildingRecord

    // Deduct actual construction material cost from player and pay workshop operator
    const actualConstructionMaterialCost = constructionCostsForContract.ducats || 0;
    if (actualConstructionMaterialCost > 0) {
      const citizenRecordForMaterialCost = await new Promise<AirtableRecord>((resolve, reject) => {
        (base!('CITIZENS') as unknown as AirtableTable).select({
          filterByFormula: `{WalletAddress} = '${data.walletAddress}'`
        }).firstPage((err, records) => {
          if (err || !records || records.length === 0) reject(err || new Error('Citizen not found for material cost deduction'));
          else resolve(records![0]);
        });
      });

      const currentCitizenDucatsForMaterial = (citizenRecordForMaterialCost.fields.Ducats as number) || 0;
      if (currentCitizenDucatsForMaterial < actualConstructionMaterialCost) {
        // Not enough for materials, this is an issue. For now, log and continue, but ideally, this should be handled.
        console.error(`Citizen ${data.walletAddress} has insufficient ducats (${currentCitizenDucatsForMaterial}) for material cost ${actualConstructionMaterialCost}. Construction project might stall.`);
      } else {
        const newCitizenDucatsAfterMaterial = currentCitizenDucatsForMaterial - actualConstructionMaterialCost;
        await new Promise((resolve, reject) => {
          (base!('CITIZENS') as unknown as AirtableTable).update([{ id: citizenRecordForMaterialCost.id, fields: { Ducats: newCitizenDucatsAfterMaterial }}], (err) => {
            if (err) reject(err); else resolve(true);
          });
        });

        // Pay workshop operator (re-fetch selectedWorkshop or pass details)
        // This part assumes selectedWorkshop details (operator username, record ID) are available from the contract creation block
        // For simplicity, re-fetching, but ideally, pass details.
         const workshopsForPayment = await new Promise<AirtableRecord[]>((resolve, reject) => {
            (base!('BUILDINGS') as unknown as AirtableTable).select({
            filterByFormula: "AND({SubCategory}='construction', {IsConstructed}=TRUE())",
            fields: ["BuildingId", "RunBy", "Owner"] 
            }).firstPage((err, records) => {
            if (err) reject(err);
            else resolve(records || []);
            });
        });
        if (workshopsForPayment.length > 0) {
            const workshopForPayment = await (async () => { // IIFE async pour permettre await dans find
                for (const w of workshopsForPayment) {
                    const contractRecords = await new Promise<AirtableRecord[]>((resolve, reject) => {
                        (base!('CONTRACTS') as unknown as AirtableTable).select({
                            filterByFormula: `{ContractId} = 'construct-${buildingId}-${(w.fields.BuildingId as string).replace(/[^a-zA-Z0-9-]/g, '')}'`
                        }).firstPage((err, records) => {
                            if (err) reject(err);
                            else resolve(records || []);
                        });
                    });
                    if (contractRecords?.[0]?.fields.SellerBuilding === w.fields.BuildingId) {
                        return w;
                    }
                }
                return undefined;
            })();
            
            if (workshopForPayment) {
                const operatorUsernameForPayment = workshopForPayment.fields.RunBy as string || workshopForPayment.fields.Owner as string;
                const operatorRecordForPayment = await new Promise<AirtableRecord>((resolve, reject) => {
                    (base!('CITIZENS') as unknown as AirtableTable).select({filterByFormula: `{Username} = '${operatorUsernameForPayment}'`}).firstPage((err, records) => {
                    if (err || !records || records.length === 0) reject(err || new Error('Workshop operator not found for payment'));
                    else resolve(records![0]);
                    });
                });
                const currentOperatorDucats = (operatorRecordForPayment.fields.Ducats as number) || 0;
                const newOperatorDucats = currentOperatorDucats + actualConstructionMaterialCost;
                await new Promise((resolve, reject) => {
                    (base!('CITIZENS') as unknown as AirtableTable).update([{id: operatorRecordForPayment.id, fields: { Ducats: newOperatorDucats }}], (err) => {
                    if (err) reject(err); else resolve(true);
                    });
                });
                console.log(`Paid ${actualConstructionMaterialCost} to workshop operator ${operatorUsernameForPayment}`);

                // Create transaction for material cost
                await new Promise((resolve, reject) => {
                    (base!('TRANSACTIONS') as unknown as AirtableTable).create({
                        Type: "construction_material_payment",
                        Asset: buildingId, AssetType: "building_project",
                        Seller: operatorUsernameForPayment, Buyer: data.walletAddress,
                        Price: actualConstructionMaterialCost,
                        ExecutedAt: new Date().toISOString(), CreatedAt: new Date().toISOString(),
                        Notes: `Payment for construction materials for ${data.type} (ID: ${buildingId}) to workshop.`
                    }, (err) => { if (err) reject(err); else resolve(true); });
                });
            }
        }
      }
    }
    
    const building = {
      id: buildingId, // Use the generated buildingId
      type: typedRecord.fields.Type,
      land_id: typedRecord.fields.LandId, // Match field name
      variant: typedRecord.fields.Variant || 'model',
      position: JSON.parse(typedRecord.fields.Position),
      rotation: typedRecord.fields.Rotation || 0,
      owner: typedRecord.fields.Owner, // Match field name
      isConstructed: typedRecord.fields.IsConstructed,
      constructionMinutesRemaining: typedRecord.fields.ConstructionMinutesRemaining,
      created_at: typedRecord.fields.CreatedAt,
      cost: typedRecord.fields.Cost || 0
    };
    
    return NextResponse.json({ 
      success: true, 
      building,
      message: 'Building created successfully, construction project initiated.'
    });
  } catch (error) {
    console.error('Error creating building at point:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create building', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
