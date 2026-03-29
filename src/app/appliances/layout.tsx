export default function AppliancesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 font-body">
      {children}
    </div>
  );
}
