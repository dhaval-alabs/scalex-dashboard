import "./globals.css";
import { AppProvider } from "@/context/AppContext";

import { CLIENT } from "@/lib/client-config";
export const metadata = { title: `ScaleX Workbench · ${CLIENT.name}`, description: "Server-side conversion intelligence" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
