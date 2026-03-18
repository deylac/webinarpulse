import "./globals.css";

export const metadata = {
  title: "WebinarPulse — Analytics pour webinaires evergreen",
  description: "Tracking et analytics pour vos webinaires différés Systeme.io avec Vimeo",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📊</text></svg>",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
