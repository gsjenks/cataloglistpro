# PhotoInventory - Auction & Inventory Management PWA

A comprehensive Progressive Web App for auction houses, antique dealers, and collectors to manage inventory with AI-powered features.

## Features

### ✨ Core Features
- **Multi-Company Management**: Switch between multiple companies seamlessly
- **Sales & Event Management**: Create and manage auctions and sales events
- **Lot Management**: Detailed item cataloging with photos and descriptions
- **Photo Management**: Multi-photo upload with primary photo designation
- **AI-Powered Data Enrichment**: Google Gemini AI analyzes photos to generate:
  - Catalog-ready titles and descriptions
  - Condition reports
  - Category and style identification
  - Market value estimates
  - Dimension approximations
- **Contacts & Documents**: Manage contacts and documents at company and sale levels
- **Authentication**: Secure email/password authentication with email verification

### 🚀 Technology Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: TailwindCSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **AI**: Google Gemini 1.5 Flash
- **Routing**: React Router v6
- **Icons**: Lucide React

## Prerequisites

Before you begin, ensure you have:
- Node.js 18+ installed
- A Supabase account (free tier works)
- A Google AI Studio API key (free tier works)

## Setup Instructions

### 1. Clone and Install

\`\`\`bash
cd photo-inventory-app
npm install
\`\`\`

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. In your Supabase dashboard, go to **SQL Editor**
3. Create a new query and paste the contents of `supabase-schema.sql`
4. Run the query to create all tables, policies, and storage buckets
5. Go to **Project Settings > API** and copy:
   - Project URL
   - Anon/Public key

### 3. Set Up Google Gemini AI

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy your API key

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

\`\`\`env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GEMINI_API_KEY=your_gemini_api_key
\`\`\`

### 5. Run the Application

\`\`\`bash
npm run dev
\`\`\`

The app will open at `http://localhost:5173`

## Usage Guide

### First Time Setup

1. **Sign Up**: Create an account with email and password
2. **Email Verification**: Check your email for verification link
3. **Create Company**: Set up your first company profile with name, address, currency, and units
4. **You're Ready**: Start creating sales and adding items!

### Creating a Sale

1. From the dashboard, click **New Sale**
2. Enter sale name, date, location, and status
3. Click **Save**

### Adding Items (Lots)

1. Click on a sale to view its details
2. Click **New Item**
3. Upload photos (required for AI features)
4. Click **AI Enrich Data** to auto-fill fields using AI
5. Review and edit the AI-generated data
6. Fill in any additional details
7. Click **Save Item**

### AI Features

The AI can analyze your photos and provide:
- **Title**: Catalog-ready item title
- **Description**: Detailed description with condition notes
- **Category**: Item classification (Furniture, Art, etc.)
- **Style/Period**: Artistic period or style
- **Origin**: Country of origin
- **Creator**: Possible maker or artist
- **Materials**: Materials and techniques used
- **Pricing**: Estimated market value and suggested starting bid
- **Dimensions**: Approximate measurements

## Project Structure

\`\`\`
photo-inventory-app/
├── src/
│   ├── components/       # React components
│   │   ├── Auth.tsx     # Authentication
│   │   ├── CompanySetup.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Header.tsx
│   │   ├── SaleDetail.tsx
│   │   ├── SalesList.tsx
│   │   ├── SaleModal.tsx
│   │   ├── LotDetail.tsx # Item editing with AI
│   │   ├── LotsList.tsx
│   │   ├── ContactsList.tsx
│   │   └── DocumentsList.tsx
│   ├── context/         # React context
│   │   └── AppContext.tsx
│   ├── lib/             # Utilities
│   │   ├── supabase.ts  # Supabase client
│   │   └── gemini.ts    # Gemini AI helpers
│   ├── types.ts         # TypeScript types
│   ├── App.tsx          # Main app component
│   └── main.tsx         # Entry point
├── supabase-schema.sql  # Database schema
├── .env.example         # Environment template
└── README.md
\`\`\`

## Database Schema

The application uses the following main tables:
- **companies**: Company profiles
- **user_companies**: User-company relationships
- **sales**: Auction/sale events
- **lots**: Individual items
- **photos**: Item photos
- **contacts**: People/entities
- **documents**: Files and documents
- **lookup_categories**: Categorization data

All tables have Row Level Security (RLS) enabled to ensure data privacy.

## PWA Features

This app is a Progressive Web App, which means:
- **Installable**: Can be installed on desktop and mobile devices
- **Offline-Ready**: Core functionality works offline (coming soon)
- **Mobile-First**: Optimized for mobile devices
- **Fast**: Built with Vite for optimal performance

## API Usage & Costs

### Supabase (Free Tier)
- Database: 500 MB
- Storage: 1 GB
- Monthly Active Users: Unlimited

### Google Gemini AI (Free Tier)
- 15 requests per minute
- 1 million tokens per day
- Free to use

## Troubleshooting

### Authentication Issues
- Ensure email verification is enabled in Supabase
- Check that your Supabase URL and keys are correct

### Photo Upload Fails
- Verify the photos storage bucket was created
- Check storage policies in Supabase dashboard
- Ensure you're signed in

### AI Features Not Working
- Verify your Gemini API key is correct
- Check browser console for error messages
- Ensure you have photos uploaded before using AI

## Future Enhancements

Phase 2 features to be added:
- Offline sync with conflict resolution
- Batch AI photo editing
- CSV import/export
- PDF report generation (catalogs, consignor reports)
- Advanced search and filtering
- Mobile camera integration
- Barcode/QR code scanning
- Real-time collaboration
- Analytics and reporting dashboard

## Contributing

This is a prototype. Feel free to fork and enhance!

## License

MIT License - feel free to use this for your projects.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review Supabase documentation
3. Review Google AI documentation

## Acknowledgments

Built with:
- [React](https://react.dev/)
- [Supabase](https://supabase.com/)
- [Google Gemini AI](https://ai.google.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Lucide Icons](https://lucide.dev/)
