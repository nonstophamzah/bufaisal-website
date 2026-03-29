'use client';

import { Star } from 'lucide-react';
import { useLang } from '@/lib/lang';

const REVIEWS = [
  {
    text: 'A treasure trove of home furnishings... fun to walk through.',
    author: 'Google Review',
  },
  {
    text: 'Good quality used furniture at very affordable prices.',
    author: 'Google Review',
  },
  {
    text: 'Must visit place. Very helping and kind staff.',
    author: 'Google Review',
  },
];

export default function SocialProof() {
  const { t } = useLang();

  return (
    <section className="bg-gray-50 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Social stats */}
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 mb-8">
          {[
            { label: 'Facebook', count: '63K+' },
            { label: 'Instagram', count: '119K+' },
            { label: 'TikTok', count: '133K+' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="font-heading text-2xl md:text-3xl">
                {s.count}
              </span>
              <span className="text-sm text-muted">{s.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="font-heading text-2xl md:text-3xl text-yellow">
              2009
            </span>
            <span className="text-sm text-muted">
              {t('Trusted Since', 'موثوق منذ')}
            </span>
          </div>
        </div>

        {/* Reviews */}
        <div className="grid md:grid-cols-3 gap-4">
          {REVIEWS.map((review, i) => (
            <div
              key={i}
              className="bg-white rounded-xl p-5 border border-gray-100"
            >
              <div className="flex gap-0.5 mb-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star
                    key={j}
                    size={14}
                    className="text-yellow fill-yellow"
                  />
                ))}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed mb-2">
                &ldquo;{review.text}&rdquo;
              </p>
              <p className="text-xs text-muted">— {review.author}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
