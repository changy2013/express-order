'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV: { href: string; icon: string; label: string }[] = [
  { href: '/', icon: '📥', label: '智能导入' },
  { href: '/orders', icon: '📋', label: '运单列表' },
  { href: '/rules', icon: '⚙️', label: '规则管理' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">鲸</div>
        <div className="sidebar-logo-text">鲸天智能<br />订单导入系统</div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((n) => {
          // 「智能导入」只在精确根路径高亮；其余按前缀匹配
          const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`sidebar-item${active ? ' active' : ''}`}>
              <span className="sidebar-item-icon">{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
