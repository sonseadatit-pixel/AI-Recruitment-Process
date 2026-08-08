import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Easing } from 'framer-motion';
import logo from '../image/logo.png';

interface WelcomeTransitionProps {
  name?: string;
  onComplete: () => void;
}

const BOUNCE_Y = [0, -420, 0, -180, 0, -85, 0, -30, 0];
const BOUNCE_EASE: Easing[] = ['easeIn', 'easeOut', 'easeIn', 'easeOut', 'easeIn', 'easeOut', 'easeIn', 'easeOut'];

export default function WelcomeTransition({ name = 'there', onComplete }: WelcomeTransitionProps) {
  const [dropped, setDropped] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setHidden(true), 4000);
    return () => clearTimeout(fadeTimer);
  }, []);

  useEffect(() => {
    if (!hidden) return;
    const done = setTimeout(onComplete, 500);
    return () => clearTimeout(done);
  }, [hidden, onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-navy-dark via-navy to-navy-light"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      initial={{ opacity: 1 }}
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <div className="flex flex-col items-center">
        {/* Logo: drops from the top and bounces like a ball, then pulses with ripple rings */}
        <div className="relative flex items-center justify-center">
          {dropped && [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full border-2 border-teal-300/40"
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: [1, 2.8], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: i * 0.65 }}
            />
          ))}
          <motion.div
            className="relative w-24 h-24 flex items-center justify-center"
            initial={{ y: -420, opacity: 0 }}
            animate={{ y: BOUNCE_Y, opacity: 1 }}
            transition={{ duration: 2, ease: BOUNCE_EASE }}
            onAnimationComplete={() => setDropped(true)}
          >
            <motion.div
              className="w-full h-full"
              animate={dropped ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              transition={{ duration: 1.6, repeat: dropped ? Infinity : 0, ease: 'easeInOut' }}
            >
              <img
                src={logo}
                alt="TalentAI logo"
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </motion.div>
          </motion.div>
        </div>

        {/* Text */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: dropped ? 1 : 0, y: dropped ? 0 : 10 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-2xl font-bold text-white mt-8">TalentAI</h1>
          <p className="text-sm text-blue-100/70 mt-1.5">Welcome back, {name}</p>
        </motion.div>
      </div>
    </motion.div>
  );
}
