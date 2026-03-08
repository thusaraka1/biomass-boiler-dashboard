import React, { useState, createContext, useContext } from 'react';

const TabsContext = createContext({});

export function Tabs({ defaultValue, className = "", children, ...props }) {
    const [value, setValue] = useState(defaultValue);
    return (
        <TabsContext.Provider value={{ value, setValue }}>
            <div className={className} {...props}>
                {children}
            </div>
        </TabsContext.Provider>
    )
}

export function TabsList({ className = "", children, ...props }) {
    return (
        <div className={`inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 p-1 text-slate-500 ${className}`} {...props}>
            {children}
        </div>
    )
}

export function TabsTrigger({ value, className = "", children, ...props }) {
    const context = useContext(TabsContext);
    const isActive = context.value === value;

    return (
        <button
            onClick={() => context.setValue(value)}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${isActive ? 'bg-white text-slate-950 shadow' : 'hover:bg-slate-200'} ${className}`}
            {...props}
        >
            {children}
        </button>
    )
}

export function TabsContent({ value, className = "", children, ...props }) {
    const context = useContext(TabsContext);
    if (context.value !== value) return null;

    return (
        <div className={`mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${className}`} {...props}>
            {children}
        </div>
    )
}
