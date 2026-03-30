import Link from 'next/link';
import { Upload, Settings, Zap } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center pt-20 pb-16 px-4">
      <div className="max-w-md w-full">
        <h1 className="font-heading text-4xl text-center mb-2">
          BU FAISAL <span className="text-yellow">LOGIN</span>
        </h1>
        <p className="text-muted text-center text-sm mb-10">
          Select your portal
        </p>

        <div className="space-y-4">
          <Link
            href="/team"
            className="group flex items-center gap-4 bg-white border-2 border-gray-200 rounded-2xl p-6 hover:border-yellow transition-colors"
          >
            <div className="w-14 h-14 bg-yellow/10 rounded-xl flex items-center justify-center group-hover:bg-yellow/20 transition-colors flex-shrink-0">
              <Upload size={28} className="text-yellow" />
            </div>
            <div>
              <h2 className="font-heading text-2xl">UPLOADS</h2>
              <p className="text-sm text-muted">
                Team portal for adding inventory
              </p>
            </div>
          </Link>

          <Link
            href="/admin"
            className="group flex items-center gap-4 bg-white border-2 border-gray-200 rounded-2xl p-6 hover:border-yellow transition-colors"
          >
            <div className="w-14 h-14 bg-yellow/10 rounded-xl flex items-center justify-center group-hover:bg-yellow/20 transition-colors flex-shrink-0">
              <Settings size={28} className="text-yellow" />
            </div>
            <div>
              <h2 className="font-heading text-2xl">ADMIN</h2>
              <p className="text-sm text-muted">
                Management portal
              </p>
            </div>
          </Link>
          <Link
            href="/appliances"
            className="group flex items-center gap-4 bg-white border-2 border-gray-200 rounded-2xl p-6 hover:border-yellow transition-colors"
          >
            <div className="w-14 h-14 bg-yellow/10 rounded-xl flex items-center justify-center group-hover:bg-yellow/20 transition-colors flex-shrink-0">
              <Zap size={28} className="text-yellow" />
            </div>
            <div>
              <h2 className="font-heading text-2xl">APPLIANCES</h2>
              <p className="text-sm text-muted">
                Appliance operations tracker
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
