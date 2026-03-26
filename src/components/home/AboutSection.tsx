import { motion } from 'framer-motion';

const skills = [
  'Photography', 'Lightroom', 'Photoshop', 'Nikon Zf',
  'Street', 'Portrait', 'Landscape', 'Architecture',
  'Color Grading', 'Composition', 'Travel', 'Editorial',
];

const timeline = [
  {
    year: '2025',
    title: 'Tokyo Neon Series',
    description: 'Captured the duality of ancient temples and neon-lit streets across Japan.',
  },
  {
    year: '2024',
    title: 'New York Stories',
    description: 'A visual journey through the streets, architecture, and energy of NYC.',
  },
  {
    year: '2024',
    title: 'Paris Lumière',
    description: 'Timeless elegance and romantic atmosphere of the City of Light.',
  },
  {
    year: '2024',
    title: 'Greek Islands',
    description: 'Sun-kissed walls and endless blue of the Mediterranean.',
  },
];

export default function AboutSection() {
  return (
    <section className="min-h-screen relative px-6 md:px-16 py-24">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-16">
        {/* Left: Sticky sidebar */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          {/* Blob avatar */}
          <motion.div
            className="relative w-48 h-48 mx-auto lg:mx-0 mb-8"
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="w-full h-full animate-blob-morph overflow-hidden bg-gray-100">
              <img
                src="https://cdn.sanity.io/images/z610fooo/production/926d2d1c1fcba0de3a1b45fd60b64e7fce7ce650-3300x2200.jpg?auto=format&w=400&q=80"
                alt="Ryan"
                className="w-full h-full object-cover"
              />
            </div>
          </motion.div>

          {/* Name & bio */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className="text-3xl font-extralight tracking-tight text-gray-900">
              Ryan Xu
            </h2>
            <p className="text-gray-400 text-sm font-light mt-3 leading-relaxed">
              Photographer based in New York. Capturing quiet moments where light meets intention.
              Shot on Nikon Zf — every frame is a conversation.
            </p>
          </motion.div>

          {/* Skill tags */}
          <motion.div
            className="flex flex-wrap gap-2 mt-6"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            {skills.map((skill, i) => (
              <motion.span
                key={skill}
                className="px-3 py-1.5 text-xs font-light tracking-wide rounded-full border border-gray-200 text-gray-500
                  hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-all duration-300 cursor-default"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + i * 0.03, duration: 0.3 }}
              >
                {skill}
              </motion.span>
            ))}
          </motion.div>

          {/* Contact links */}
          <motion.div
            className="mt-8 flex items-center gap-4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
          >
            <a
              href="mailto:hello@ryanxu.com"
              className="text-xs text-gray-400 hover:text-gray-900 transition-colors tracking-wider uppercase font-light"
            >
              Email
            </a>
            <span className="text-gray-200">|</span>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-gray-900 transition-colors tracking-wider uppercase font-light"
            >
              Instagram
            </a>
          </motion.div>
        </div>

        {/* Right: Timeline */}
        <div className="relative">
          <motion.h3
            className="text-lg font-light text-gray-300 tracking-widest uppercase mb-12"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Journey
          </motion.h3>

          {/* Timeline line */}
          <div className="absolute left-[7px] lg:left-[7px] top-20 bottom-0 w-px bg-gray-100" />

          <div className="space-y-12">
            {timeline.map((item, i) => (
              <motion.div
                key={i}
                className="relative pl-10"
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              >
                {/* Timeline dot */}
                <div className="absolute left-0 top-1 w-[14px] h-[14px] rounded-full border-2 border-gray-200 bg-white" />

                {/* Card - glassmorphism style */}
                <div className="glass-light rounded-2xl p-6 hover:shadow-lg transition-shadow duration-500">
                  <span className="text-[10px] font-mono text-gray-300 tracking-wider">
                    {item.year}
                  </span>
                  <h4 className="text-lg font-light text-gray-900 mt-1 tracking-tight">
                    {item.title}
                  </h4>
                  <p className="text-sm text-gray-400 font-light mt-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
