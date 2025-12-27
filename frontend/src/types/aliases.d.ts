declare module '@/lib/utils' {
  /** Simple helper for concatenating class names — typed loosely. */
  export function cn(...inputs: any[]): string;

  /** Default export (loose) to allow `import utils from '@/lib/utils'`. */
  const _default: { [key: string]: any };
  export default _default;
}
