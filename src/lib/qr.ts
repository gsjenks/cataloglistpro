/**
 * src/lib/qr.ts
 * QR Code generation utility
 * Generates QR codes for lots and stores them in Supabase
 */

import QRCode from 'qrcode';
import { supabase } from './supabase';

/**
 * Generates a QR code for a lot and stores it in Supabase storage
 * Call this function when a lot is created or updated
 * 
 * @param saleId - The sale ID from the database
 * @param lotId - The lot ID from the database
 * @param lotNumber - The lot number (e.g., 001, 002, etc.)
 * @returns The public URL of the QR code image, or null if failed
 */
export async function generateQRCodeForLot(
  saleId: string,
  lotId: string,
  lotNumber: number
): Promise<string | null> {
  try {
    // Create the public URL that the QR code will link to
    const appUrl = import.meta.env.VITE_APP_URL || 'http://localhost:5173';
    const lotUrl = `${appUrl}/sale/${saleId}/lot/${lotNumber}`;

    console.log(`Generating QR code for lot ${lotNumber}: ${lotUrl}`);

    // Generate QR code as data URL (PNG image)
    const qrCodeDataUrl = await QRCode.toDataURL(lotUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      margin: 1,
      width: 300,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    // Convert data URL to blob
    const response = await fetch(qrCodeDataUrl);
    const blob = await response.blob();

    // Upload to Supabase storage
    const fileName = `qr-codes/${saleId}/${lotNumber}.png`;
    
    const { error } = await supabase.storage
      .from('lot-qr-codes')
      .upload(fileName, blob, { upsert: true });

    if (error) {
      console.error('Error uploading QR code to storage:', error);
      return null;
    }

    // Get the public URL of the uploaded QR code
    const { data: publicUrlData } = supabase.storage
      .from('lot-qr-codes')
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    // Update the lot record with the QR code URL
    const { error: updateError } = await supabase
      .from('lots')
      .update({ qr_code_url: publicUrl })
      .eq('id', lotId);

    if (updateError) {
      console.error('Error updating lot with QR code URL:', updateError);
      return null;
    }

    console.log(`QR code generated successfully for lot ${lotNumber}`);
    return publicUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
}

/**
 * You'll call this function from your lot creation/update handler
 * 
 * Example usage in your existing lot save code:
 * 
 * // After saving lot to Supabase:
 * const newLot = await saveLotToSupabase(...);
 * 
 * // Generate QR code
 * await generateQRCodeForLot(saleId, newLot.id, newLot.lot_number);
 */