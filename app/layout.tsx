import "./globals.css";
import { AppProvider } from "@/context/AppContext";

export const metadata = { title: "ScaleX Workbench · AnalytixLabs", description: "Server-side conversion intelligence" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
