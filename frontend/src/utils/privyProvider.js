import { ethers } from 'ethers'

export const getEthereumAddressFromPrivy = async (privyUser) => {
  try {
    if (!privyUser || !privyUser.wallet) {
      throw new Error('No wallet found')
    }
    return privyUser.wallet.address
  } catch (error) {
    console.error('Error getting address:', error)
    throw error
  }
}

export const generateMultiChainAddressesFromPrivy = async (privyUser) => {
  try {
    const address = await getEthereumAddressFromPrivy(privyUser)
    
    // Privy uses the same address across all EVM chains
    return {
      sepolia: address,
      polygonAmoy: address,
      arbitrumSepolia: address,
    }
  } catch (error) {
    console.error('Error generating addresses:', error)
    throw error
  }
}

export const getUserInfoFromPrivy = (privyUser) => {
  try {
    if (!privyUser) {
      return null
    }

    return {
      email: privyUser.email?.address || null,
      name: privyUser.google?.name || privyUser.github?.name || privyUser.discord?.username || null,
      profileImage: privyUser.google?.profilePictureUrl || privyUser.github?.profilePictureUrl || null,
      verifierId: privyUser.id,
      verifier: 'privy',
      typeOfLogin: 'privy',
      aggregateVerifier: null,
    }
  } catch (error) {
    console.error('Error getting user info:', error)
    return null
  }
}

export const getProviderFromPrivy = async (privyUser) => {
  try {
    if (!privyUser || !privyUser.wallet) {
      throw new Error('No wallet found')
    }

    // Privy provides an EIP-1193 compatible provider via walletClient
    // For MetaMask/Privy wallet, use window.ethereum or the walletClient provider
    if (window.ethereum) {
      return window.ethereum
    }
    
    // Fallback: return null if no provider is available
    return null
  } catch (error) {
    console.error('Error getting provider:', error)
    throw error
  }
}
