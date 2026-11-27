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

export const getTenantColor = (tenantId: number | null): string => {
  if (tenantId === null) return '#ffffff';
  return TENANT_COLORS[tenantId % TENANT_COLORS.length];
};

