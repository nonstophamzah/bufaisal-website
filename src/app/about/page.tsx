import { MapPin, Store, Calendar, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export const revalidate = 60;

const stats = [
  { icon: Calendar, label: 'Since', value: '2009' },
  { icon: Store, label: 'Shops', value: '5' },
  { icon: MapPin, label: 'Location', value: 'Ajman, UAE' },
  { icon: Users, label: 'Customers Served', value: '10,000+' },
];

async function getAboutText() {
  const { data } = await supabase
    .from('website_config')
    .select('config_value')
    .eq('config_key', 'about_text')
    .maybeSingle();
  return data?.config_value || null;
}

export default async function AboutPage() {
  const aboutText = await getAboutText();

  return (
    <div className="pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="bg-black text-white rounded-2xl p-8 md:p-16 mb-12">
          <p className="text-yellow text-sm font-medium tracking-widest uppercase mb-4">
            Our Story
          </p>
          <h1 className="font-heading text-4xl md:text-6xl mb-6">
            ABOUT <span className="text-yellow">BU FAISAL</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl leading-relaxed">
            {aboutText ||
              "Since 2009, Bu Faisal has been Ajman's trusted destination for quality pre-owned goods. What started as a single shop has grown into the UAE's biggest used goods souq, operating 5 shops across Ajman."}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-light rounded-xl p-6 text-center"
            >
              <stat.icon size={28} className="mx-auto text-yellow mb-3" />
              <p className="font-heading text-3xl">{stat.value}</p>
              <p className="text-sm text-muted">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="font-heading text-3xl mb-4">
              OUR <span className="text-yellow">MISSION</span>
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We believe in giving quality items a second life. Every piece in
              our collection is carefully inspected to ensure it meets our
              standards before being offered to our customers.
            </p>
            <p className="text-gray-600 leading-relaxed">
              By choosing pre-owned goods, our customers save money while
              contributing to a more sustainable way of living. It&apos;s a
              win for everyone.
            </p>
          </div>
          <div>
            <h2 className="font-heading text-3xl mb-4">
              OUR <span className="text-yellow">SHOPS</span>
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              With 5 shops (A through E) in Ajman, each location offers a
              unique selection of items. From furniture and appliances to
              clothing and specialty finds, there&apos;s something for
              everyone.
            </p>
            <div className="grid grid-cols-5 gap-2 mt-4">
              {['A', 'B', 'C', 'D', 'E'].map((shop) => (
                <div
                  key={shop}
                  className="bg-yellow/10 rounded-lg p-4 text-center"
                >
                  <span className="font-heading text-2xl">
                    {shop}
                  </span>
                  <p className="text-xs text-muted mt-1">Shop {shop}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
