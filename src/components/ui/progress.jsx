import React from 'react';

export function Progress({ className = "", value, ...props }) {
    return (
        <div className={`relative h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className}`} {...props}>
            <div
                className="h-full w-full flex-1 bg-emerald-500 transition-all"
                style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
            />
        </div>
    )
}
