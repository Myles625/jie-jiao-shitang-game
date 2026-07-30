import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "蓝宝石餐厅 · 1998经营模拟",
  description: "忠于经典餐厅经营规则的原创浏览器游戏原型。",
  openGraph: {
    title: "蓝宝石餐厅 · 1998经营模拟",
    description: "布置餐厅、设计菜单、招聘员工，在木场经营你的第一家小店。",
    images: [{ url: "/og.png", width: 1680, height: 945, alt: "蓝宝石餐厅游戏画面" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "蓝宝石餐厅 · 1998经营模拟",
    description: "忠于经典规则的原创浏览器餐厅经营游戏。",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
