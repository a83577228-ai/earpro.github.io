// 安全区域工具类
export const safeAreaClasses = {
  top: "pt-[env(safe-area-inset-top)]",
  bottom: "pb-[env(safe-area-inset-bottom)]", 
  left: "pl-[env(safe-area-inset-left)]",
  right: "pr-[env(safe-area-inset-right)]",
  all: "pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
};

// 移动端优化类
export const mobileOptimizedClasses = {
  button: "min-h-[44px] min-w-[44px] flex items-center justify-center",
  touchTarget: "min-h-[44px]",
  preventSelect: "select-none"
};