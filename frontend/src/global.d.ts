// global.d.ts

// Allow importing any .jsx file as a module
declare module '*.jsx' {
  const component: any;
  export default component;
}

// Allow importing named exports from .jsx UI components
declare module './components/ui/*' {
  export const Button: any;
  export const Input: any;
  export const Label: any;
  export const Card: any;
  export const CardContent: any;
  export const CardHeader: any;
  export const CardTitle: any;
  export const Badge: any;
  export const Collapsible: any;
  export const CollapsibleContent: any;
  export const CollapsibleTrigger: any;
  export const Toaster: any;
}
