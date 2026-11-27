export const TENANT_COLORS: string[] = [
  '#52b788', // 0. Vintage Sage Green
  '#e63946', // 1. Vintage Rust Red
  '#f4a261', // 2. Vintage Burnt Amber
  '#e9c46a', // 3. Vintage Mustard Yellow
  '#2a9d8f', // 4. Vintage Washed Teal
  '#457b9d', // 5. Vintage Faded Indigo
  '#9d4edd', // 6. Vintage Dusty Plum
  '#d62828', // 7. Vintage Terracotta Red
  '#8d99ae', // 8. Vintage Muted Slate
  '#48cae4', // 9. Vintage Hologram Cyan
];

// Saturated high-contrast palette for light paper theme (>=4.5:1 vs #f7f5f0 and #ffffff)
export const LIGHT_TENANT_COLORS: string[] = [
  '#2d6a4f', // 0. Deep Forest Green
  '#c1121f', // 1. Crimson Red
  '#b45309', // 2. Deep Burnt Amber
  '#854d0e', // 3. Dark Ochre Gold
  '#0f766e', // 4. Deep Pine Teal
  '#1d4ed8', // 5. Cobalt Blue
  '#6d28d9', // 6. Deep Plum
  '#991b1b', // 7. Dark Terracotta
  '#334155', // 8. Deep Slate
  '#0369a1', // 9. Deep Cyan Blue
];

export const getTenantColor = (tenantId: number | null, isLight: boolean = false): string => {
  if (tenantId === null) return isLight ? '#666056' : '#b0b3b8';
  const palette = isLight ? LIGHT_TENANT_COLORS : TENANT_COLORS;
  return palette[Math.abs(tenantId) % palette.length];
};

