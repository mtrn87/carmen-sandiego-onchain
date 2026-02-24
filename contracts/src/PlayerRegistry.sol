// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title PlayerRegistry
 * @notice Stores player profile data on-chain: nickname, rank, statistics, and mission history.
 *         Integrates with GameMaster to track player progression and achievements.
 *         Supports EIP-2771 for gasless transactions via Chainlink Functions.
 */
contract PlayerRegistry {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    // ============================================================
    //                        STRUCTS
    // ============================================================

    struct Player {
        address wallet;
        string nickname;
        uint256 rank;                    // 0=Rookie, 1=Detective, 2=Senior Detective, etc
        uint256 missionsCompleted;       // Total successful captures
        uint256 missionsAttempted;       // Total mission attempts (completed + failed)
        uint256 totalReward;             // Sum of all rewards earned
        uint256 totalCluesCollected;     // Total clues across all missions
        uint256 totalInvestigations;     // Total investigations across all missions
        uint256 registeredAt;            // Registration timestamp
        bool isActive;                   // Account status
    }

    struct MissionRecord {
        uint256 missionId;
        uint256 capturedChainId;         // Chain where Carmen was captured (0 if failed)
        uint8 cluesCollected;
        uint8 investigationsUsed;
        uint256 blocksUsed;
        uint256 reward;
        uint256 timestamp;
        bool success;                    // true=captured, false=failed
    }

    // ============================================================
    //                        STATE
    // ============================================================

    mapping(address => Player) public players;
    mapping(string => address) public nicknameToPlayer;           // nickname => player address
    mapping(address => MissionRecord[]) public playerMissions;    // player => mission history
    mapping(address => uint256[]) public playerNFTs;              // player => NFT token IDs

    address public owner;
    address public gameMaster;                                    // GameMaster contract address
    
    // EIP-2771 nonce for replay protection
    mapping(address => uint256) public nonces;

    uint256 public constant RANK_ROOKIE = 0;
    uint256 public constant RANK_DETECTIVE = 1;
    uint256 public constant RANK_SENIOR_DETECTIVE = 2;
    uint256 public constant RANK_INSPECTOR = 3;
    uint256 public constant RANK_CHIEF_INSPECTOR = 4;
    uint256 public constant RANK_COMMISSIONER = 5;

    // Rank thresholds (based on total reward)
    uint256 public constant THRESHOLD_DETECTIVE = 100;
    uint256 public constant THRESHOLD_SENIOR_DETECTIVE = 300;
    uint256 public constant THRESHOLD_INSPECTOR = 600;
    uint256 public constant THRESHOLD_CHIEF_INSPECTOR = 1000;
    uint256 public constant THRESHOLD_COMMISSIONER = 1500;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event PlayerRegistered(address indexed player, string nickname, uint256 timestamp);
    event PlayerStatsUpdated(
        address indexed player,
        uint256 missionsCompleted,
        uint256 totalReward,
        uint256 newRank
    );
    event MissionRecorded(
        address indexed player,
        uint256 missionId,
        bool success,
        uint256 reward
    );
    event NFTAwarded(address indexed player, uint256 nftId);
    event NicknameChanged(address indexed player, string oldNickname, string newNickname);
    event GameMasterSet(address indexed gameMaster);

    // --- CRE Trigger-and-Callback Events ---
    event PlayerCheckRequested(address indexed player);
    event PlayerCheckResult(address indexed player, bool exists, string nickname, uint256 rank);
    event RegistrationRequested(address indexed player, string nickname);
    event RegistrationConfirmed(address indexed player, string nickname, uint256 rank);

    // ============================================================
    //                        MODIFIERS
    // ============================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyGameMaster() {
        require(msg.sender == gameMaster, "Only GameMaster");
        _;
    }

    modifier playerExists(address player) {
        require(players[player].wallet != address(0), "Player not registered");
        _;
    }

    // ============================================================
    //                     CONSTRUCTOR
    // ============================================================

    constructor() {
        owner = msg.sender;
    }

    // ============================================================
    //                    PLAYER REGISTRATION
    // ============================================================

    /**
     * @notice Request registration with signature (EIP-2771 for Chainlink Functions).
     * @dev Validates signature and emits RegistrationRequested for CRE to process.
     *      Chainlink Functions pays gas - user pays nothing.
     * @param playerAddress The player's wallet address
     * @param nickname The player's unique nickname
     * @param signature The signature from the player (signed with their private key)
     * @param nonce The nonce to prevent replay attacks
     */
    function requestRegistrationWithSignature(
        address playerAddress,
        string calldata nickname,
        bytes calldata signature,
        uint256 nonce
    ) external {
        require(playerAddress != address(0), "Invalid address");
        require(players[playerAddress].wallet == address(0), "Already registered");
        require(_isValidNickname(nickname), "Invalid nickname");
        require(!_nicknameExists(nickname), "Nickname taken");
        require(nonce == nonces[playerAddress], "Invalid nonce");
        
        // Verify signature: player signed { playerAddress, nickname, nonce, contractAddress }
        // Frontend uses signMessage() which adds the Ethereum prefix automatically
        // So we need to recover directly from the signature using the message hash
        bytes32 messageHash = keccak256(abi.encodePacked(playerAddress, nickname, nonce, address(this)));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address recoveredAddress = ECDSA.recover(ethSignedMessageHash, signature);
        
        require(recoveredAddress == playerAddress, "Invalid signature");
        
        // Increment nonce for replay protection
        nonces[playerAddress]++;
        
        // Emit event for CRE to process
        emit RegistrationRequested(playerAddress, nickname);
    }

    /**
     * @notice Request registration (triggers CRE to handle registration as paymaster).
     * @dev Emits RegistrationRequested event for CRE to listen and process.
     *      No gas required from user - CRE pays as paymaster.
     * @param nickname The player's unique nickname (3-20 chars, alphanumeric + _ -)
     */
    function requestRegistration(string calldata nickname) external {
        require(players[msg.sender].wallet == address(0), "Already registered");
        require(_isValidNickname(nickname), "Invalid nickname");
        require(!_nicknameExists(nickname), "Nickname taken");
        
        emit RegistrationRequested(msg.sender, nickname);
    }

    /**
     * @notice Register a player (called by CRE after processing RegistrationRequested event).
     * @dev Only GameMaster (CRE) can call this to complete registration.
     * @param playerAddress The player's wallet address
     * @param nickname The player's unique nickname
     */
    function registerPlayer(address playerAddress, string calldata nickname) external onlyGameMaster {
        require(playerAddress != address(0), "Invalid address");
        require(players[playerAddress].wallet == address(0), "Already registered");
        require(_isValidNickname(nickname), "Invalid nickname");
        require(!_nicknameExists(nickname), "Nickname taken");

        _createPlayer(playerAddress, nickname);
    }


    /**
     * @notice Internal function to create a player.
     */
    function _createPlayer(address playerAddress, string calldata nickname) internal {
        players[playerAddress] = Player({
            wallet: playerAddress,
            nickname: nickname,
            rank: RANK_ROOKIE,
            missionsCompleted: 0,
            missionsAttempted: 0,
            totalReward: 0,
            totalCluesCollected: 0,
            totalInvestigations: 0,
            registeredAt: block.timestamp,
            isActive: true
        });

        nicknameToPlayer[nickname] = playerAddress;

        emit PlayerRegistered(playerAddress, nickname, block.timestamp);
    }

    // ============================================================
    //                    CRE TRIGGER FUNCTIONS
    // ============================================================

    /**
     * @notice Trigger function: Check if player exists (called by Frontend).
     *         Emits PlayerCheckRequested event for CRE to listen.
     * @param player The player address to check
     */
    function checkPlayerExists(address player) external {
        emit PlayerCheckRequested(player);
    }


    // ============================================================
    //                    CRE CALLBACK FUNCTIONS
    // ============================================================

    /**
     * @notice Callback function: Record check result (called by CRE).
     *         CRE calls this after reading player data.
     * @param player The player address
     * @param exists Whether player exists
     * @param nickname The player's nickname (if exists)
     * @param rank The player's rank (if exists)
     */
    function recordCheckResult(
        address player,
        bool exists,
        string calldata nickname,
        uint256 rank
    ) external onlyGameMaster {
        emit PlayerCheckResult(player, exists, nickname, rank);
    }

    /**
     * @notice Callback function: Confirm registration (called by CRE).
     *         CRE calls this after validating and registering player.
     * @param player The player address
     * @param nickname The player's nickname
     */
    function confirmRegistration(address player, string calldata nickname) external onlyGameMaster {
        require(players[player].wallet != address(0), "Not registered");
        emit RegistrationConfirmed(player, nickname, players[player].rank);
    }

    // ============================================================
    //                    STATS UPDATE (GameMaster)
    // ============================================================

    /**
     * @notice Update player statistics after a mission completes or fails.
     *         Called by GameMaster after capture or failure.
     * @param player The player address
     * @param reward Reward earned (0 if mission failed)
     * @param cluesCollected Clues collected in this mission
     * @param investigationsUsed Investigations used in this mission
     * @param blocksUsed Blocks elapsed during mission
     * @param success true if mission succeeded (capture), false if failed
     */
    function updatePlayerStats(
        address player,
        uint256 reward,
        uint8 cluesCollected,
        uint8 investigationsUsed,
        uint256 blocksUsed,
        bool success
    ) external onlyGameMaster playerExists(player) {
        Player storage p = players[player];

        // Increment mission counters
        p.missionsAttempted++;
        if (success) {
            p.missionsCompleted++;
        }

        // Update reward and statistics
        p.totalReward += reward;
        p.totalCluesCollected += cluesCollected;
        p.totalInvestigations += investigationsUsed;

        // Update rank based on total reward
        uint256 newRank = _calculateRank(p.totalReward);
        p.rank = newRank;

        // Record mission in history
        playerMissions[player].push(
            MissionRecord({
                missionId: 0,  // Will be set by caller if needed
                capturedChainId: 0,
                cluesCollected: cluesCollected,
                investigationsUsed: investigationsUsed,
                blocksUsed: blocksUsed,
                reward: reward,
                timestamp: block.timestamp,
                success: success
            })
        );

        emit PlayerStatsUpdated(player, p.missionsCompleted, p.totalReward, newRank);
    }

    /**
     * @notice Record a mission with full details (including missionId and capturedChainId).
     *         Called by GameMaster after capture.
     */
    function recordMission(
        address player,
        uint256 missionId,
        uint256 capturedChainId,
        uint8 cluesCollected,
        uint8 investigationsUsed,
        uint256 blocksUsed,
        uint256 reward,
        bool success
    ) external onlyGameMaster playerExists(player) {
        Player storage p = players[player];

        // Update counters
        p.missionsAttempted++;
        if (success) {
            p.missionsCompleted++;
        }

        // Update statistics
        p.totalReward += reward;
        p.totalCluesCollected += cluesCollected;
        p.totalInvestigations += investigationsUsed;

        // Update rank
        uint256 newRank = _calculateRank(p.totalReward);
        p.rank = newRank;

        // Record mission
        playerMissions[player].push(
            MissionRecord({
                missionId: missionId,
                capturedChainId: capturedChainId,
                cluesCollected: cluesCollected,
                investigationsUsed: investigationsUsed,
                blocksUsed: blocksUsed,
                reward: reward,
                timestamp: block.timestamp,
                success: success
            })
        );

        emit MissionRecorded(player, missionId, success, reward);
        emit PlayerStatsUpdated(player, p.missionsCompleted, p.totalReward, newRank);
    }

    // ============================================================
    //                    NFT MANAGEMENT
    // ============================================================

    /**
     * @notice Award an NFT to a player (called by GameMaster after minting).
     * @param player The player address
     * @param nftId The NFT token ID
     */
    function addPlayerNFT(address player, uint256 nftId) external onlyGameMaster playerExists(player) {
        playerNFTs[player].push(nftId);
        emit NFTAwarded(player, nftId);
    }

    // ============================================================
    //                    VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Get player profile data.
     * @dev Returns player data if exists, or empty struct if not found.
     */
    function getPlayer(address player) external view returns (Player memory) {
        return players[player];
    }

    /**
     * @notice Check if a nickname is available.
     */
    function isNicknameAvailable(string calldata nickname) external view returns (bool) {
        return !_nicknameExists(nickname);
    }

    /**
     * @notice Get player's mission history.
     */
    function getPlayerMissions(address player) external view returns (MissionRecord[] memory) {
        require(players[player].wallet != address(0), "Player not found");
        return playerMissions[player];
    }

    /**
     * @notice Get number of missions for a player.
     */
    function getMissionCount(address player) external view returns (uint256) {
        return playerMissions[player].length;
    }

    /**
     * @notice Get a specific mission record.
     */
    function getMission(address player, uint256 index) external view returns (MissionRecord memory) {
        require(index < playerMissions[player].length, "Mission not found");
        return playerMissions[player][index];
    }

    /**
     * @notice Get player's NFT collection.
     */
    function getPlayerNFTs(address player) external view returns (uint256[] memory) {
        return playerNFTs[player];
    }

    /**
     * @notice Get player's current rank.
     */
    function getPlayerRank(address player) external view returns (uint256) {
        require(players[player].wallet != address(0), "Player not found");
        return players[player].rank;
    }

    /**
     * @notice Calculate player's score (for leaderboard).
     *         Score = (missionsCompleted * 100) + totalReward
     */
    function getPlayerScore(address player) external view returns (uint256) {
        require(players[player].wallet != address(0), "Player not found");
        Player memory p = players[player];
        return (p.missionsCompleted * 100) + p.totalReward;
    }

    /**
     * @notice Get player's win rate (percentage).
     *         Returns: (missionsCompleted / missionsAttempted) * 100
     */
    function getPlayerWinRate(address player) external view returns (uint256) {
        require(players[player].wallet != address(0), "Player not found");
        Player memory p = players[player];
        if (p.missionsAttempted == 0) return 0;
        return (p.missionsCompleted * 100) / p.missionsAttempted;
    }

    /**
     * @notice Get average blocks per mission.
     */
    function getAverageBlocksPerMission(address player) external view returns (uint256) {
        require(players[player].wallet != address(0), "Player not found");
        if (playerMissions[player].length == 0) return 0;

        uint256 totalBlocks = 0;
        for (uint256 i = 0; i < playerMissions[player].length; i++) {
            totalBlocks += playerMissions[player][i].blocksUsed;
        }
        return totalBlocks / playerMissions[player].length;
    }

    // ============================================================
    //                    ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Set the GameMaster contract address.
     */
    function setGameMaster(address _gameMaster) external onlyOwner {
        require(_gameMaster != address(0), "Invalid address");
        gameMaster = _gameMaster;
        emit GameMasterSet(_gameMaster);
    }

    /**
     * @notice Deactivate a player account (admin only).
     */
    function deactivatePlayer(address player) external onlyOwner playerExists(player) {
        players[player].isActive = false;
    }

    /**
     * @notice Reactivate a player account (admin only).
     */
    function reactivatePlayer(address player) external onlyOwner playerExists(player) {
        players[player].isActive = true;
    }

    // ============================================================
    //                    INTERNAL FUNCTIONS
    // ============================================================

    /**
     * @notice Validate nickname format.
     *         Requirements: 3-20 chars, alphanumeric + underscore + hyphen
     */
    function _isValidNickname(string calldata nickname) internal pure returns (bool) {
        bytes memory b = bytes(nickname);

        // Check length
        if (b.length < 3 || b.length > 20) return false;

        // Check characters
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 char = b[i];

            // Allow: a-z, A-Z, 0-9, _, -
            bool isAlphanumeric = (char >= 0x30 && char <= 0x39) ||  // 0-9
                                  (char >= 0x41 && char <= 0x5A) ||  // A-Z
                                  (char >= 0x61 && char <= 0x7A);    // a-z
            bool isUnderscore = char == 0x5F;                        // _
            bool isHyphen = char == 0x2D;                            // -

            if (!isAlphanumeric && !isUnderscore && !isHyphen) {
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Check if a nickname already exists.
     */
    function _nicknameExists(string calldata nickname) internal view returns (bool) {
        return nicknameToPlayer[nickname] != address(0);
    }

    /**
     * @notice Calculate rank based on total reward.
     */
    function _calculateRank(uint256 totalReward) internal pure returns (uint256) {
        if (totalReward >= THRESHOLD_COMMISSIONER) return RANK_COMMISSIONER;
        if (totalReward >= THRESHOLD_CHIEF_INSPECTOR) return RANK_CHIEF_INSPECTOR;
        if (totalReward >= THRESHOLD_INSPECTOR) return RANK_INSPECTOR;
        if (totalReward >= THRESHOLD_SENIOR_DETECTIVE) return RANK_SENIOR_DETECTIVE;
        if (totalReward >= THRESHOLD_DETECTIVE) return RANK_DETECTIVE;
        return RANK_ROOKIE;
    }
}
