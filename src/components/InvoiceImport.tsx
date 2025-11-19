import { useState, useRef } from 'react';
import { Upload, FileText, Download, AlertCircle, CheckCircle2, Package } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from '../lib/supabase';

// Use LOCAL worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface InvoiceImportProps {
  saleId: string;
  saleName: string;
}

interface Invoice {
  invoice: string;
  bidder: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  shipping_method: string;
  payment_status: string;
  items: Array<{
    lot: string;
    description: string;
    hammer_price?: number;
  }>;
}

interface ParseStats {
  invoicesProcessed: number;
  packingListRows: number;
  shippingLabelRows: number;
  pricesUpdated?: number;
}

export default function InvoiceImport({ saleId, saleName }: InvoiceImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ParseStats | null>(null);
  const [packingListCsv, setPackingListCsv] = useState<string | null>(null);
  const [shippingLabelsCsv, setShippingLabelsCsv] = useState<string | null>(null);
  const [updatePrices, setUpdatePrices] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatPhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    } else if (digits.length > 11) {
      return phone.startsWith('+') ? phone : '+' + digits;
    }
    return digits || phone;
  };

  const normalizeShippingMethod = (method: string): string => {
    method = method.toLowerCase().replace(/\s+/g, ' ').trim();
    if (method.includes('liveauctioneers') || method.includes('live auctioneers')) {
      return 'Shipped by Live Auctioneers';
    } else if (method.includes('bidder')) {
      return 'Buyer-arranged shipping';
    }
    return method;
  };

  const parseInvoicePage = (text: string): Invoice | null => {
    const invoice: Partial<Invoice> = {};
    
    // Extract invoice number
    const invoiceMatch = text.match(/(\d{7})\s*Paid/);
    if (!invoiceMatch) return null;
    invoice.invoice = invoiceMatch[1];
    
    // Extract phone first (we'll use this as an anchor)
    const phoneMatch = text.match(/\b(\d{10,})\b/);
    invoice.phone = phoneMatch ? formatPhone(phoneMatch[1]) : '';
    
    // Extract bidder and email together, then separate them
    if (phoneMatch) {
      // Get everything from "Bidder" to the phone number
      const bidderMatch = text.match(/Bidder\s+(.+?)(?=\s*\d{10})/);
      
      if (bidderMatch) {
        let bidderAndEmail = bidderMatch[1].replace(/\s+/g, ' ').trim();
        
        // Try to find email in this text by removing all spaces
        const noSpaces = bidderAndEmail.replace(/\s+/g, '');
        const emailMatch = noSpaces.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        
        if (emailMatch) {
          invoice.email = emailMatch[1];
          
          // Remove the email (with spaces) from bidder text
          // Find where email starts in the original spaced text
          const emailParts = emailMatch[1].split('@');
          const emailStart = bidderAndEmail.indexOf(emailParts[0]);
          
          if (emailStart > 0) {
            invoice.bidder = bidderAndEmail.substring(0, emailStart).trim();
          } else {
            invoice.bidder = bidderAndEmail;
          }
        } else {
          // No email found, everything is bidder name
          invoice.bidder = bidderAndEmail;
          invoice.email = '';
        }
      } else {
        invoice.bidder = '';
        invoice.email = '';
      }
    } else {
      // No phone found, try basic extraction
      const bidderMatch = text.match(/Bidder\s+([A-Za-z\s.'-]+)/);
      invoice.bidder = bidderMatch ? bidderMatch[1].replace(/\s+/g, ' ').trim() : '';
      invoice.email = '';
    }
    
    // Extract shipping method
    const shippingMatch = text.match(/Shipping\s+Method\s+(.+?)(?:\s+Shipping\s+Address|\s+Invoice\s+Details|$)/i);
    invoice.shipping_method = shippingMatch ? normalizeShippingMethod(shippingMatch[1]) : 'Unknown';
    
    // Payment status
    invoice.payment_status = text.includes('Paid') ? 'Paid' : 'Unpaid';
    
    // Extract shipping address - HANDLES BOTH US AND INTERNATIONAL
    const addressMatch = text.match(/Shipping\s+Address\s+(.+?)(?=\s+Shipping\s+Method)/i);
    if (addressMatch) {
      let addressText = addressMatch[1].replace(/\s+/g, ' ').trim();
      
      // Look for Country and ZIP at the end: , COUNTRY , ZIPCODE
      // Country can be 2-3 letters (US, UK, NZ, etc.)
      const countryZipMatch = addressText.match(/,\s*([A-Z]{2,3})\s*,\s*([\d-]+)\s*$/);
      
      if (countryZipMatch) {
        invoice.country = countryZipMatch[1];
        invoice.zip = countryZipMatch[2];
        
        // Remove country and zip from the end
        let remaining = addressText.substring(0, addressText.lastIndexOf(countryZipMatch[0])).trim();
        
        // Split by commas
        const parts = remaining.split(/,\s*/);
        
        if (parts.length >= 3) {
          // Format: Street, City, State/Region
          invoice.state = parts[parts.length - 1].trim();  // Last part is state/region
          invoice.city = parts[parts.length - 2].trim();   // Second to last is city
          invoice.street = parts.slice(0, -2).join(', ').trim();  // Everything else is street
        } else if (parts.length === 2) {
          // Format: Street, City (no state)
          invoice.city = parts[parts.length - 1].trim();
          invoice.street = parts[0].trim();
          invoice.state = '';
        } else {
          // Just one part - treat as street
          invoice.street = remaining;
          invoice.city = '';
          invoice.state = '';
        }
      } else {
        // Fallback if pattern doesn't match
        invoice.street = addressText;
        invoice.city = '';
        invoice.state = '';
        invoice.zip = '';
        invoice.country = '';
      }
    } else {
      invoice.street = '';
      invoice.city = '';
      invoice.state = '';
      invoice.zip = '';
      invoice.country = '';
    }
    
    // Extract lot items - ONLY from Invoice Details section
    invoice.items = [];
    
    // Find the Invoice Details section
    const detailsMatch = text.match(/Invoice\s+Details\s+.*?(?:Description.*?Price\s+)(.+?)(?=Estimated\s*Online|Payment\s*Received|Sales\s*Tax|Total\s*\$|Balance\s*Due|$)/is);
    
    if (detailsMatch) {
      const detailsText = detailsMatch[1];
      
      // Look for lot pattern: 4 digits starting with 0, dash, description, then prices
      // Pattern: 0159 - Description $ 16.00 $ 3.20 $ 19.20
      const lotPattern = /(0\d{3})\s*-\s*([^$]+?)(?:\s*\$\s*([\d,.]+))?(?=\s*\$|\s*0\d{3}\s*-|Estimated|Payment|Sales|Total|Balance|$)/gi;
      
      let match;
      while ((match = lotPattern.exec(detailsText)) !== null) {
        const lotNum = match[1];
        let description = match[2];
        const hammerPrice = match[3] ? parseFloat(match[3].replace(/,/g, '')) : undefined;
        
        // Clean up excessive spaces
        description = description.replace(/\s+/g, ' ').trim();
        
        // Skip if too short
        if (description.length < 3) {
          continue;
        }
        
        // Remove trailing junk
        description = description
          .replace(/Estimated.*$/i, '')
          .replace(/Payment.*$/i, '')
          .replace(/Sales.*$/i, '')
          .replace(/Total.*$/i, '')
          .replace(/Balance.*$/i, '')
          .replace(/Shipping.*$/i, '')
          .trim();
        
        if (description) {
          invoice.items!.push({
            lot: lotNum,
            description: description,
            hammer_price: hammerPrice
          });
        }
      }
    }
    
    return invoice as Invoice;
  };

  const extractInvoicesFromPdf = async (pdfFile: File): Promise<Invoice[]> => {
    const invoices: Invoice[] = [];
    const arrayBuffer = await pdfFile.arrayBuffer();
    
    try {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let currentInvoiceText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Build text with spaces
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        
        // Check if new invoice starts on this page
        if (/\d{7}\s*Paid/.test(pageText)) {
          // Process previous invoice
          if (currentInvoiceText) {
            const invoice = parseInvoicePage(currentInvoiceText);
            if (invoice && invoice.items && invoice.items.length > 0) {
              invoices.push(invoice);
            }
          }
          currentInvoiceText = pageText;
        } else {
          currentInvoiceText += ' ' + pageText;
        }
      }
      
      // Process last invoice
      if (currentInvoiceText) {
        const invoice = parseInvoicePage(currentInvoiceText);
        if (invoice && invoice.items && invoice.items.length > 0) {
          invoices.push(invoice);
        }
      }
      
      return invoices;
    } catch (err) {
      console.error('PDF parsing error:', err);
      throw new Error('Failed to parse PDF. Please ensure it\'s a valid LiveAuctioneers invoice PDF.');
    }
  };

  const updateLotPrices = async (invoices: Invoice[]): Promise<number> => {
    let updatedCount = 0;
    
    for (const invoice of invoices) {
      for (const item of invoice.items) {
        if (item.hammer_price !== undefined) {
          try {
            // Find the lot by lot_number in the current sale
            const { data: lots, error: findError } = await supabase
              .from('lots')
              .select('id')
              .eq('sale_id', saleId)
              .eq('lot_number', item.lot)
              .limit(1);
            
            if (findError) {
              console.error(`Error finding lot ${item.lot}:`, findError);
              continue;
            }
            
            if (lots && lots.length > 0) {
              // Update the sold_price
              const { error: updateError } = await supabase
                .from('lots')
                .update({ sold_price: item.hammer_price })
                .eq('id', lots[0].id);
              
              if (updateError) {
                console.error(`Error updating lot ${item.lot}:`, updateError);
              } else {
                updatedCount++;
                console.log(`✅ Updated lot ${item.lot} with price $${item.hammer_price}`);
              }
            } else {
              console.warn(`⚠️ Lot ${item.lot} not found in sale`);
            }
          } catch (err) {
            console.error(`Error processing lot ${item.lot}:`, err);
          }
        }
      }
    }
    
    return updatedCount;
  };

  const generatePackingListCsv = (invoices: Invoice[]): string => {
    const rows: string[][] = [];
    rows.push(['Invoice', 'Bidder', 'Phone', 'Email', 'Lot', 'Description', 'Hammer Price', 'Shipping Method', 'Payment Status']);
    
    for (const invoice of invoices) {
      for (const item of invoice.items) {
        rows.push([
          invoice.invoice,
          invoice.bidder,
          invoice.phone,
          invoice.email,
          item.lot,
          `"${item.description.replace(/"/g, '""')}"`,
          item.hammer_price !== undefined ? `$${item.hammer_price.toFixed(2)}` : '',
          invoice.shipping_method,
          invoice.payment_status
        ]);
      }
    }
    
    return rows.map(row => row.join(',')).join('\r\n');
  };

  const generateShippingLabelsCsv = (invoices: Invoice[]): string => {
    const rows: string[][] = [];
    rows.push(['Invoice', 'Bidder', 'Phone', 'Email', 'Lot', 'Description', 'Street', 'City', 'State', 'ZIP', 'Country', 'Shipping Method', 'Payment Status']);
    
    for (const invoice of invoices) {
      for (const item of invoice.items) {
        rows.push([
          invoice.invoice,
          invoice.bidder,
          invoice.phone,
          invoice.email,
          item.lot,
          `"${item.description.replace(/"/g, '""')}"`,
          invoice.street,
          invoice.city,
          invoice.state,
          invoice.zip,
          invoice.country,
          invoice.shipping_method,
          invoice.payment_status
        ]);
      }
    }
    
    return rows.map(row => row.join(',')).join('\r\n');
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
      setStats(null);
      setPackingListCsv(null);
      setShippingLabelsCsv(null);
    } else {
      setError('Please select a valid PDF file');
    }
  };

  const handleParse = async () => {
    if (!file) return;
    
    setParsing(true);
    setError(null);
    
    try {
      console.log('Starting PDF parse...');
      const invoices = await extractInvoicesFromPdf(file);
      console.log(`Extracted ${invoices.length} invoices`);
      
      if (invoices.length === 0) {
        throw new Error('No invoices found in PDF');
      }
      
      // Update prices in database if checkbox is checked
      let pricesUpdated = 0;
      if (updatePrices) {
        console.log('Updating hammer prices in database...');
        pricesUpdated = await updateLotPrices(invoices);
        console.log(`Updated ${pricesUpdated} lot prices`);
      }
      
      const packingList = generatePackingListCsv(invoices);
      const shippingLabels = generateShippingLabelsCsv(invoices);
      
      let totalRows = 0;
      invoices.forEach(inv => totalRows += inv.items.length);
      
      setStats({
        invoicesProcessed: invoices.length,
        packingListRows: totalRows,
        shippingLabelRows: totalRows,
        pricesUpdated: updatePrices ? pricesUpdated : undefined
      });
      
      setPackingListCsv(packingList);
      setShippingLabelsCsv(shippingLabels);
    } catch (err) {
      console.error('Error parsing PDF:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse PDF';
      setError(errorMessage);
    } finally {
      setParsing(false);
    }
  };

  const downloadCsv = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleReset = () => {
    setFile(null);
    setError(null);
    setStats(null);
    setPackingListCsv(null);
    setShippingLabelsCsv(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-8 h-8 text-indigo-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Invoice Import & Labels</h3>
            <p className="text-sm text-gray-600">
              Parse LiveAuctioneers invoices and generate packing lists and shipping labels
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">How to use:</h4>
          <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
            <li>Download your invoice PDF from LiveAuctioneers Partners portal</li>
            <li>Upload the PDF file below</li>
            <li>Optionally check "Add Hammer Price to Database" to update lot prices</li>
            <li>Click "Parse Invoices" to extract data</li>
            <li>Download the generated packing list and shipping labels CSV files</li>
          </ol>
        </div>

        {/* File Upload */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            LiveAuctioneers Invoice PDF
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="flex-1 block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-indigo-50 file:text-indigo-700
                hover:file:bg-indigo-100
                cursor-pointer"
            />
            {file && (
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
            )}
          </div>
          {file && (
            <p className="mt-2 text-xs text-gray-500">
              Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        {/* Update Prices Checkbox */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={updatePrices}
              onChange={(e) => setUpdatePrices(e.target.checked)}
              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Add Hammer Price to Database
            </span>
          </label>
          <p className="text-xs text-gray-500 ml-6 mt-1">
            Updates the sold_price field for each lot in the database with the hammer price from the invoice
          </p>
        </div>

        {/* Parse Button */}
        <button
          onClick={handleParse}
          disabled={!file || parsing}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {parsing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Parsing Invoices...</span>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              <span>Parse Invoices</span>
            </>
          )}
        </button>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-800 font-medium">Error parsing PDF</p>
                <p className="text-xs text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {stats && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Processing Complete</h3>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-indigo-600">{stats.invoicesProcessed}</p>
              <p className="text-sm text-gray-600 mt-1">Invoices Processed</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-indigo-600">{stats.packingListRows}</p>
              <p className="text-sm text-gray-600 mt-1">Packing List Items</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-indigo-600">{stats.shippingLabelRows}</p>
              <p className="text-sm text-gray-600 mt-1">Shipping Labels</p>
            </div>
          </div>

          {/* Price Update Stats */}
          {stats.pricesUpdated !== undefined && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm font-medium text-green-900">
                  Updated {stats.pricesUpdated} lot prices in database
                </p>
              </div>
            </div>
          )}

          {/* Download Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => downloadCsv(packingListCsv!, `${saleName}_packing_list.csv`)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download Packing List CSV (with Hammer Prices)</span>
            </button>

            <button
              onClick={() => downloadCsv(shippingLabelsCsv!, `${saleName}_shipping_labels.csv`)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download Shipping Labels CSV</span>
            </button>
          </div>

          {/* File Info */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              <strong>Packing List:</strong> Contains invoice#, bidder, contact info, lot#, description, hammer price, shipping method, and payment status.<br/>
              <strong>Shipping Labels:</strong> Same as packing list (without hammer price) plus full shipping address (street, city, state, ZIP, country).
            </p>
          </div>
        </div>
      )}

      {/* Info Card */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">About This Tool</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex items-start gap-2">
            <Package className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Packing List:</strong> Use this to pack and organize items for shipment. 
              Each row contains one item with buyer information, lot details, and hammer price.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Shipping Labels:</strong> Contains full shipping addresses for creating labels. 
              Import into your label printing software or shipping platform.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Database Update:</strong> When enabled, automatically updates the sold_price 
              field for each lot with the hammer price from the invoice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}