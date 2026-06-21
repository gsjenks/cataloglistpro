/**
 * src/app/sale/[saleId]/lot/[lotNumber]/page.tsx
 * Public lot page route
 * This is the page that buyers see when they scan a QR code
 * URL format: /sale/abc123/lot/001
 */
/* eslint-disable react-refresh/only-export-components */

import { PublicLotPage } from "@/components/PublicLotPage";
import { Metadata } from "next";

interface PageProps {
  params: Promise<{
    saleId: string;
    lotNumber: string;
  }>;
}

/**
 * Generate metadata for SEO
 * This shows up in browser tabs and search results
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lotNumber } = await params;

  return {
    title: `Item #${lotNumber} - Benson Estate Sales`,
    description: "View item details and photos",
    openGraph: {
      title: `Item #${lotNumber} - Benson Estate Sales`,
      description: "View item details and photos from our estate sales",
    },
  };
}

/**
 * Main page component
 * Renders the public lot page for buyers
 */
export default async function SaleLotPage({ params }: PageProps) {
  const { saleId, lotNumber } = await params;

  // Validate lot number is numeric
  if (!lotNumber || isNaN(parseInt(lotNumber))) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Invalid item</h1>
          <p className="mt-2 text-gray-600">The item number is not valid.</p>
        </div>
      </div>
    );
  }

  return <PublicLotPage saleId={saleId} lotNumber={parseInt(lotNumber)} />;
}
