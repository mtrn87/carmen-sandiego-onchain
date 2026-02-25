import { useNavigate } from 'react-router-dom'
import NeonButton from '../components/NeonButton'
import styles from './HelpPage.module.css'

const SECTIONS = [
  {
    title: 'OBJECTIVE',
    lines: [
      'Track down Carmen Sandiego across multiple blockchain cities.',
      'Gather clues, investigate locations, and capture her before time runs out.',
    ],
  },
  {
    title: 'GAME FLOW',
    lines: [
      '1. Register your agent codename and connect your wallet.',
      '2. Start a mission — the VRF oracle assigns Carmen a hidden location.',
      '3. Travel to cities on different chains (Arbitrum, Base, XDC).',
      '4. Inspect locations, scan for anomalies, and request clues.',
      '5. Collect 3+ wallet fragments to unlock capture mode.',
      '6. Submit the reconstructed wallet address to capture Carmen.',
    ],
  },
  {
    title: 'ENERGY',
    lines: [
      'Each action on a CityNode costs energy (max 10).',
      'Energy regenerates at 1 point every 15 minutes.',
      'Plan your investigations wisely!',
    ],
  },
  {
    title: 'REWARD TIERS',
    lines: [
      'GOLD   — Capture in 0-20 blocks',
      'SILVER — Capture in 21-35 blocks',
      'BRONZE — Capture in 36-50 blocks',
      'Rewards are recorded on-chain as MissionNFT trophies.',
    ],
  },
  {
    title: 'TERMINAL COMMANDS',
    lines: [
      '/help        — Show this help guide',
      '/leaderboard — Open the leaderboard',
      '/plot        — View current mission plot',
      'Type anything else to interact with the ACME AI assistant.',
    ],
  },
]

export default function HelpPage() {
  const navigate = useNavigate()

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <span className={styles.headerIcon}>[</span>
          <span className={styles.headerTitle}>AGENT HANDBOOK</span>
          <span className={styles.headerIcon}>]</span>
        </div>

        <div className={styles.sections}>
          {SECTIONS.map((section) => (
            <div key={section.title} className={styles.section}>
              <h2 className={styles.sectionTitle}>{section.title}</h2>
              {section.lines.map((line, i) => (
                <p key={i} className={styles.sectionLine}>{line}</p>
              ))}
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <NeonButton variant="cyan" onClick={() => navigate(-1)}>
            BACK
          </NeonButton>
          <NeonButton variant="magenta" onClick={() => navigate('/')}>
            HOME
          </NeonButton>
        </div>
      </div>
    </div>
  )
}
