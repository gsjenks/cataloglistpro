/**
 * LotNumberService - Handles lot number generation and management
 * Supports both online and offline modes with conflict resolution
 */

import { supabase } from '../lib/supabase';

// Temporary lot numbers use negative values to avoid conflicts
const TEMP_NUMBER_START = -1000000;
let tempNumberCounter = TEMP_NUMBER_START;

/**
 * Get the next available lot number for a sale
 * In offline mode, assigns a temporary negative number
 * In online mode, gets the actual next number from the database
 */
export async function getNextLotNumber(
  saleId: string,
  isOnline: boolean
): Promise<number> {
  if (!isOnline) {
    // Offline: Generate temporary negative number
    return generateTemporaryNumber();
  }

  try {
    // Online: Get the highest lot number from the database
    const { data, error } = await supabase
      .from('lots')
      .select('lot_number')
      .eq('sale_id', saleId)
      .order('lot_number', { ascending: false })
      .limit(1);

    if (error) throw error;

    // If there are existing lots, increment the highest number
    if (data && data.length > 0 && data[0].lot_number) {
      const highestNumber = data[0].lot_number;
      // Skip any temporary numbers (negative values)
      return highestNumber < 0 ? 1 : highestNumber + 1;
    }

    // No existing lots, start at 1
    return 1;
  } catch (error) {
    console.error('Error getting next lot number:', error);
    // Fallback to temporary number on error
    return generateTemporaryNumber();
  }
}

/**
 * Generate a temporary lot number (negative value)
 * These will be replaced with real numbers when syncing online
 */
function generateTemporaryNumber(): number {
  const tempNumber = tempNumberCounter;
  tempNumberCounter--;
  return tempNumber;
}

/**
 * Check if a lot number is temporary (negative value)
 */
export function isTemporaryNumber(lotNumber: number | string | undefined): boolean {
  if (lotNumber === undefined || lotNumber === null) {
    return false;
  }
  
  // Handle both number and string types (since Lot.lot_number can be number | string)
  const numValue = typeof lotNumber === 'string' ? parseFloat(lotNumber) : lotNumber;
  
  if (isNaN(numValue)) {
    return false;
  }
  
  return numValue < 0;
}

/**
 * Reassign temporary lot numbers to permanent ones
 * Called during sync when reconnecting online
 */
export async function reassignTemporaryNumbers(
  saleId: string
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Get all lots with temporary numbers for this sale
    const { data: tempLots, error: fetchError } = await supabase
      .from('lots')
      .select('id, lot_number')
      .eq('sale_id', saleId)
      .lt('lot_number', 0)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;

    if (!tempLots || tempLots.length === 0) {
      return { success: true, errors: [] };
    }

    // Get the next available permanent number
    let nextNumber = await getNextLotNumber(saleId, true);

    // Reassign each temporary lot
    for (const lot of tempLots) {
      try {
        const { error: updateError } = await supabase
          .from('lots')
          .update({ lot_number: nextNumber })
          .eq('id', lot.id);

        if (updateError) {
          errors.push(`Failed to update lot ${lot.id}: ${updateError.message}`);
        } else {
          nextNumber++;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Error updating lot ${lot.id}: ${message}`);
      }
    }

    return {
      success: errors.length === 0,
      errors,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      errors: [`Failed to reassign temporary numbers: ${message}`],
    };
  }
}

/**
 * Validate that a lot number is unique within a sale
 */
export async function isLotNumberUnique(
  saleId: string,
  lotNumber: number,
  excludeLotId?: string
): Promise<boolean> {
  try {
    let query = supabase
      .from('lots')
      .select('id')
      .eq('sale_id', saleId)
      .eq('lot_number', lotNumber);

    if (excludeLotId) {
      query = query.neq('id', excludeLotId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return !data || data.length === 0;
  } catch (error) {
    console.error('Error checking lot number uniqueness:', error);
    return false;
  }
}

/**
 * Get lot number statistics for a sale
 */
export async function getLotNumberStats(saleId: string): Promise<{
  total: number;
  temporary: number;
  highest: number;
  gaps: number[];
}> {
  try {
    const { data, error } = await supabase
      .from('lots')
      .select('lot_number')
      .eq('sale_id', saleId)
      .order('lot_number', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return { total: 0, temporary: 0, highest: 0, gaps: [] };
    }

    const numbers = data.map(lot => lot.lot_number).filter(n => n != null);
    const temporary = numbers.filter(n => n < 0).length;
    const permanent = numbers.filter(n => n > 0);
    const highest = permanent.length > 0 ? Math.max(...permanent) : 0;

    // Find gaps in the sequence
    const gaps: number[] = [];
    if (permanent.length > 0) {
      const sortedPermanent = permanent.sort((a, b) => a - b);
      for (let i = sortedPermanent[0]; i < highest; i++) {
        if (!sortedPermanent.includes(i)) {
          gaps.push(i);
        }
      }
    }

    return {
      total: numbers.length,
      temporary,
      highest,
      gaps,
    };
  } catch (error) {
    console.error('Error getting lot number stats:', error);
    return { total: 0, temporary: 0, highest: 0, gaps: [] };
  }
}