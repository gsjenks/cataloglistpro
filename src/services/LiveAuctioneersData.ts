// LiveAuctioneersData.ts
// LiveAuctioneers category codes and reference data

export interface LACodeItem {
  id: number;
  name: string;
}

// Import the JSON data - adjust path as needed for your project structure
import laDataJson from '../data/liveauctioneers_data.json';

export const LAData = {
  categories: laDataJson.categories as LACodeItem[],
  origins: laDataJson.origins as LACodeItem[],
  styles: laDataJson.styles as LACodeItem[],
  creators: laDataJson.creators as LACodeItem[],
  materials: laDataJson.materials as LACodeItem[]
};

export function getLACategories(): LACodeItem[] {
  return LAData.categories;
}

export function getLAOrigins(): LACodeItem[] {
  return LAData.origins;
}

export function getLAStyles(): LACodeItem[] {
  return LAData.styles;
}

export function getLACreators(): LACodeItem[] {
  return LAData.creators;
}

export function getLAMaterials(): LACodeItem[] {
  return LAData.materials;
}

export function searchLAItems(items: LACodeItem[], query: string): LACodeItem[] {
  if (!query) return items;
  
  const lowerQuery = query.toLowerCase();
  return items.filter(item => 
    item.id.toString().includes(lowerQuery) ||
    item.name.toLowerCase().includes(lowerQuery)
  );
}