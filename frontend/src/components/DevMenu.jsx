import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import {
  CITY_MAP,
  getConfiguredCityNodes,
  getConnectedWalletAddress,
  getGameMasterDebugState,
  getCityNodeState,
  ensureSepoliaNetwork,
  registerPlayer,
  startMission,
  submitInvestigation,
} from '../services/contractService'
import { getPublicKeyHex } from '../utils/ecies'
import styles from './DevMenu.module.css'

const MISSION_STATUS = {
  0: 'None',
  1: 'Active',
  2: 'Completed',
  3: 'Failed',
}

export default function DevMenu() {
  const { walletAddress, missionId, initGame } = useGameStore()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [txLoading, setTxLoading] = useState(false)
  const [error, setError] = useState('')
  const [gameMasterState, setGameMasterState] = useState(null)
  const [cityStates, setCityStates] = useState([])
  const [missionInput, setMissionInput] = useState('')

  const configuredNodes = useMemo(() => getConfiguredCityNodes(), [])

  const refreshState = async (forcedMissionId) => {
    setError('')
    setLoading(true)

    try {
      const effectiveWallet = walletAddress || await getConnectedWalletAddress()
      const gmState = await getGameMasterDebugState(effectiveWallet)

      const missionToQueryRaw = forcedMissionId ?? missionInput
      const missionToQuery = Number(
        missionToQueryRaw || gmState.activeMissionId || missionId || 0
      )

      const states = await Promise.all(
        configuredNodes.map((node) => getCityNodeState(node.chainId, missionToQuery))
      )

      setGameMasterState(gmState)
      setCityStates(states)

      if (!missionInput && (gmState.activeMissionId || missionId)) {
        setMissionInput(String(gmState.activeMissionId || missionId))
      }
    } catch (err) {
      setError(err.message || 'Failed to refresh debug state')
    } finally {
      setLoading(false)
    }
  }

  const runTx = async (runner) => {
    setTxLoading(true)
    setError('')

    try {
      await ensureSepoliaNetwork()
      await runner()
      await initGame()
      await refreshState()
    } catch (err) {
      setError(err.message || 'Transaction failed')
    } finally {
      setTxLoading(false)
    }
  }

  const handleRegister = async () => {
    await runTx(async () => {
      const publicKey = await getPublicKeyHex()
      await registerPlayer(publicKey)
    })
  }

  const handleStartMission = async () => {
    await runTx(async () => {
      await startMission()
    })
  }

  const handleInvestigate = async (chainId) => {
    await runTx(async () => {
      await submitInvestigation(chainId)
    })
  }

  useEffect(() => {
    if (open) refreshState()
  }, [open])

  return (
    <div className={styles.container}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        {open ? 'CLOSE DEV' : 'OPEN DEV'}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <h3 className={styles.title}>Developer Menu</h3>
            <span className={styles.mode}>MODE: {import.meta.env.MODE}</span>
          </div>

          <div className={styles.actions}>
            <button className={styles.btn} onClick={() => refreshState()} disabled={loading || txLoading}>
              {loading ? 'Refreshing...' : 'Refresh state'}
            </button>
            <button className={styles.btn} onClick={handleRegister} disabled={txLoading}>
              Register player
            </button>
            <button className={styles.btn} onClick={handleStartMission} disabled={txLoading}>
              Start mission
            </button>
          </div>

          <label className={styles.label}>
            Mission ID para CityNode:
            <input
              className={styles.input}
              value={missionInput}
              onChange={(e) => setMissionInput(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Active mission ID"
            />
          </label>

          <div className={styles.investigateRow}>
            {[421614, 84532, 51].map((chainId) => (
              <button
                key={chainId}
                className={styles.btnSmall}
                onClick={() => handleInvestigate(chainId)}
                disabled={txLoading}
              >
                Investigate {CITY_MAP[chainId]?.name || chainId}
              </button>
            ))}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Wallet / GameMaster</div>
            <div className={styles.kv}><span>Wallet:</span><span>{gameMasterState?.walletAddress || walletAddress || '-'}</span></div>
            <div className={styles.kv}><span>Registered:</span><span>{String(gameMasterState?.registered ?? '-')}</span></div>
            <div className={styles.kv}><span>Active mission:</span><span>{gameMasterState?.activeMissionId ?? '-'}</span></div>
            <div className={styles.kv}><span>Valid cities:</span><span>{(gameMasterState?.validCities || []).join(', ') || '-'}</span></div>
            <div className={styles.kv}>
              <span>Carmen location:</span>
              <span>
                {gameMasterState?.carmenLocation
                  ? `${gameMasterState.carmenLocation.name} (${gameMasterState.carmenLocation.chainId})`
                  : '-'}
              </span>
            </div>
            <div className={styles.kv}><span>Mission status:</span><span>{MISSION_STATUS[gameMasterState?.mission?.status] || '-'}</span></div>
            <div className={styles.kv}><span>Investigations:</span><span>{gameMasterState?.mission?.investigationsCount ?? '-'}</span></div>
            <div className={styles.kv}><span>Clues:</span><span>{gameMasterState?.cluesCount ?? '-'}</span></div>
            <div className={styles.kv}><span>Blocks used:</span><span>{gameMasterState?.blocksUsed ?? '-'}</span></div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>CityNodes</div>
            {cityStates.length === 0 && <div className={styles.empty}>No CityNode data loaded.</div>}
            {cityStates.map((node) => (
              <div className={styles.nodeCard} key={node.chainId}>
                <div className={styles.nodeTop}>
                  <strong>{node.name}</strong>
                  <span>{node.chainId}</span>
                </div>
                <div className={styles.kv}><span>Address:</span><span>{node.address || 'not set'}</span></div>
                <div className={styles.kv}><span>Carmen here:</span><span>{node.carmenPresent === undefined ? '-' : String(node.carmenPresent)}</span></div>
                <div className={styles.kv}><span>CRE oracle:</span><span>{node.creOracle || '-'}</span></div>
                {node.error && <div className={styles.errorInline}>{node.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
