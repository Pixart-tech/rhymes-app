import * as React from "react"

import { cn } from "../../lib/utils"

const Input = React.forwardRef<any, any>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border file:border-black file:rounded-md file:px-3 file:text-sm file:font-medium file:text-black hover:file:bg-gray-100 file:mr-4 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
