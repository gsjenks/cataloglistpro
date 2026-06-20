/**
 * src/lib/printing.ts
 * Label printing utility
 * Generates PDF labels for 4x6 Brother QL-820W printer
 */

interface LabelData {
  lotNumber: number;
  lotName: string;
  price?: number;
  qrCodeUrl?: string;
}

/**
 * Generates a PDF label (4x6 inches) for printing
 * Compatible with Brother QL-820W thermal printer
 * 
 * @param data - Label data (lot number, name, price, QR code URL)
 * @returns PDF blob that can be printed
 */
export async function generateLabelPDF(data: LabelData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const html2canvas = (await import('html2canvas')).default;

  // Create an off-screen HTML element that matches label dimensions
  const labelDiv = document.createElement('div');
  
  // 4x6 inches at 144 DPI = 576x864 pixels
  labelDiv.style.width = '576px';
  labelDiv.style.height = '864px';
  labelDiv.style.padding = '20px';
  labelDiv.style.boxSizing = 'border-box';
  labelDiv.style.backgroundColor = 'white';
  labelDiv.style.fontFamily = 'Arial, sans-serif';
  labelDiv.style.display = 'flex';
  labelDiv.style.flexDirection = 'column';
  labelDiv.style.alignItems = 'center';
  labelDiv.style.justifyContent = 'center';
  labelDiv.style.textAlign = 'center';

  // Build HTML for label
  labelDiv.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: 28px; font-weight: bold; margin-bottom: 8px;">
        ITEM #${String(data.lotNumber).padStart(3, '0')}
      </div>
      <div style="font-size: 14px; color: #333; max-width: 400px; word-break: break-word; line-height: 1.3;">
        ${data.lotName}
      </div>
    </div>
    
    ${
      data.price
        ? `
      <div style="font-size: 40px; font-weight: bold; color: #0066cc; margin: 20px 0;">
        $${data.price}
      </div>
    `
        : ''
    }
    
    ${
      data.qrCodeUrl
        ? `
      <div style="margin: 30px 0;">
        <img src="${data.qrCodeUrl}" style="width: 280px; height: 280px; border: 2px solid #000;" />
      </div>
    `
        : ''
    }
    
    <div style="font-size: 11px; color: #666; margin-top: 20px;">
      Benson Estate Sales<br/>
      info@bensonestatesales.com
    </div>
  `;

  // Add to DOM temporarily
  document.body.appendChild(labelDiv);

  try {
    // Convert to canvas (this captures the rendered HTML)
    const canvas = await html2canvas(labelDiv, {
      scale: 1,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
    });

    // Create PDF document (4x6 inches)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'inch',
      format: [4, 6],
      compress: true,
    });

    // Add canvas image to PDF
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, 4, 6);

    // Return as blob
    const pdfBlob = pdf.output('blob');
    return pdfBlob;
  } finally {
    // Clean up
    document.body.removeChild(labelDiv);
  }
}

/**
 * Opens the browser's print dialog with the generated PDF
 * User can then select their Brother printer and print
 * 
 * @param data - Label data
 */
export async function printLabelViaBrowser(data: LabelData): Promise<void> {
  try {
    console.log(`Generating label for item #${data.lotNumber}...`);
    
    // Generate PDF
    const pdfBlob = await generateLabelPDF(data);

    // Create blob URL
    const blobUrl = URL.createObjectURL(pdfBlob);

    // Open print dialog
    const printWindow = window.open(blobUrl);

    if (printWindow) {
      // Trigger print when PDF loads
      printWindow.onload = () => {
        printWindow.print();
      };
    } else {
      console.error('Failed to open print dialog. Check browser pop-up settings.');
      alert('Failed to open print dialog. Please check your browser pop-up settings.');
    }
  } catch (error) {
    console.error('Error printing label:', error);
    alert('Error generating label. Please try again.');
  }
}

/**
 * Downloads the label PDF instead of printing it
 * Useful for batch printing later
 * 
 * @param data - Label data
 */
export async function downloadLabelPDF(data: LabelData): Promise<void> {
  try {
    const pdfBlob = await generateLabelPDF(data);
    const blobUrl = URL.createObjectURL(pdfBlob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `label-item-${String(data.lotNumber).padStart(3, '0')}.pdf`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Cleanup
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Error downloading label:', error);
    alert('Error downloading label. Please try again.');
  }
}

/**
 * Example usage in your lot details component:
 * 
 * <button
 *   onClick={() => printLabelViaBrowser({
 *     lotNumber: lot.lot_number,
 *     lotName: lot.name,
 *     price: lot.buy_now_price,
 *     qrCodeUrl: lot.qr_code_url,
 *   })}
 *   className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
 * >
 *   🖨️ Print Label
 * </button>
 */