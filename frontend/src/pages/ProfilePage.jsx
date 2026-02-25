import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import styles from './ProfilePage.module.css';

const ProfilePage = () => {
  const { getPlayerGlobalProgress, getMissionRecord, gameMaster } = useGameStore();
  const [playerData, setPlayerData] = useState(null);
  const [missionHistory, setMissionHistory] = useState([]);

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (gameMaster) {
        const data = await getPlayerGlobalProgress();
        setPlayerData(data);
        const history = [];
        for (let i = 0; i < data.missionsCompleted; i++) {
          const mission = await getMissionRecord(i);
          history.push(mission);
        }
        setMissionHistory(history);
      }
    };
    fetchPlayerData();
  }, [gameMaster, getPlayerGlobalProgress, getMissionRecord]);

  if (!playerData) {
    return <div>Loading profile...</div>;
  }

  const {
    missionsCompleted,
    goldMedals,
    silverMedals,
    bronzeMedals,
    totalBlocks,
    avgTime,
  } = playerData;

  return (
    <div className={styles.profileContainer}>
      <h1 className={styles.title}>Player Profile</h1>

      <div className={styles.statsGrid}>
        <div className={styles.statItem}>
          <h2>Missions Completed</h2>
          <p>{missionsCompleted.toString()}</p>
        </div>
        <div className={styles.statItem}>
          <h2>Gold Medals</h2>
          <p>{goldMedals.toString()}</p>
        </div>
        <div className={styles.statItem}>
          <h2>Silver Medals</h2>
          <p>{silverMedals.toString()}</p>
        </div>
        <div className={styles.statItem}>
          <h2>Bronze Medals</h2>
          <p>{bronzeMedals.toString()}</p>
        </div>
        <div className={styles.statItem}>
          <h2>Total Blocks</h2>
          <p>{totalBlocks.toString()}</p>
        </div>
        <div className={styles.statItem}>
          <h2>Average Time</h2>
          <p>{avgTime.toString()} seconds</p>
        </div>
      </div>

      <div className={styles.progressSection}>
        <h2>Current Game Progress</h2>
        <div className={styles.progressBar}>
          <div
            className={styles.progress}
            style={{ width: `${(playerData.citiesVisited / 10) * 100}%` }}
          >
            Cities Visited: {playerData.citiesVisited.toString()} / 10
          </div>
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progress}
            style={{ width: `${(playerData.leadsFound / 5) * 100}%` }}
          >
            Leads Found: {playerData.leadsFound.toString()} / 5
          </div>
        </div>
      </div>

      <div className={styles.missionHistory}>
        <h2>Mission History</h2>
        {missionHistory.length > 0 ? (
          missionHistory.map((mission, index) => (
            <div key={index} className={styles.missionItem}>
              <h3>Mission #{index + 1}</h3>
              <p>Time: {mission.time.toString()} seconds</p>
              <p>Blocks: {mission.blocks.toString()}</p>
              <p>Medal: {mission.medal.toString()}</p>
            </div>
          ))
        ) : (
          <p>No missions completed yet.</p>
        )}
      </div>

      <div className={styles.nftGallery}>
        <h2>NFT Trophies</h2>
        <div className={styles.nftGrid}>
          {missionHistory.map(
            (mission, index) =>
              mission.medal > 0 && (
                <div key={index} className={styles.nftCard}>
                  <img src={`/nft_stolen.png`} alt='NFT Trophy' />
                  <p>Mission #{index + 1}</p>
                </div>
              )
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
