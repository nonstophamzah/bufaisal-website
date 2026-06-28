import Link from 'next/link';
import { Upload, Settings, Zap, Hammer, Fuel, ChevronRight } from 'lucide-react';

const PORTALS = [
  {
    href: '/team',
    icon: Upload,
    title: 'Uploads',
    subtitle: 'Add new items to inventory',
  },
  {
    href: '/admin',
    icon: Settings,
    title: 'Admin',
    subtitle: 'Manage listings and approvals',
  },
  {
    href: '/appliances',
    icon: Zap,
    title: 'Appliances',
    subtitle: 'Appliance tracking and repairs',
  },
  {
    href: '/carpenter-tracker',
    icon: Hammer,
    title: 'Carpenter',
    subtitle: 'Job tracking and photos',
  },
  {
    href: '/diesel',
    icon: Fuel,
    title: 'Diesel',
    subtitle: 'Fuel monitoring',
  },
];

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#111111] flex flex-col items-center px-5 pt-16 pb-10">
      <div className="w-full max-w-[400px] flex flex-col flex-1">
        {/* Wordmark */}
        <div className="mb-12 text-center">
          <span className="font-heading text-2xl tracking-wide text-[#F9D923]">
            BUFAISAL
          </span>
        </div>

        {/* Portal tiles */}
        <div className="flex flex-col">
          {PORTALS.map(({ href, icon: Icon, title, subtitle }, i) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-4 py-4 transition-transform active:scale-95 ${
                i !== 0 ? 'border-t border-white/10' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-[#F9D923] flex items-center justify-center flex-shrink-0">
                <Icon size={24} className="text-black" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[18px] font-bold text-white leading-tight">
                  {title}
                </h2>
                <p className="text-[13px] text-[#888888] leading-tight mt-0.5">
                  {subtitle}
                </p>
              </div>
              <ChevronRight
                size={20}
                className="text-[#888888] flex-shrink-0"
              />
            </Link>
          ))}
        </div>

        {/* Bottom caption */}
        <div className="mt-auto pt-12 text-center">
          <p className="text-[12px] text-[#888888]">
            Bufaisal Internal — Staff Only
          </p>
        </div>
      </div>
    </div>
  );
}
