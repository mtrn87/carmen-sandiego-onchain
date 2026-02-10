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
    
    // Privy usa o mesmo endereço em todas as chains EVM
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

    // Privy fornece um provider EIP-1193 compatível via walletClient
    // Para MetaMask/Privy wallet, usamos window.ethereum ou o provider do walletClient
    if (window.ethereum) {
      return window.ethereum
    }
    
    // Fallback: retorna null se não houver provider disponível
    return null
  } catch (error) {
    console.error('Error getting provider:', error)
    throw error
  }
}
