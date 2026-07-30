import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "蓝宝石餐厅 · 1998梦幻经营物语",
  description: "可旋转的3D箱庭餐厅：布置店面、研究料理、培养员工，在东京经营一家温暖的洋食馆。",
  openGraph: {
    title: "蓝宝石餐厅 · 1998梦幻经营物语",
    description: "布置餐厅、研究菜单、培养员工，在可旋转的3D东京箱庭中经营第一家洋食馆。",
    images: [{ url: "/og-1998-redesign.png", width: 1440, height: 960, alt: "蓝宝石餐厅梦幻经营游戏画面" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "蓝宝石餐厅 · 1998梦幻经营物语",
    description: "可旋转3D箱庭与经典洋食馆经营玩法。",
    images: ["/og-1998-redesign.png"],
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
