const STORAGE_KEYS = {
  WEB3AUTH_ADDRESS: 'web3auth_address',
  WEB3AUTH_USER: 'web3auth_user',
  WEB3AUTH_ADDRESSES: 'web3auth_addresses',
  PLAYER_NICKNAME: 'player_nickname',
}

export const saveAuthSession = (address, userInfo, addresses, nickname) => {
  try {
    localStorage.setItem(STORAGE_KEYS.WEB3AUTH_ADDRESS, address)
    localStorage.setItem(STORAGE_KEYS.WEB3AUTH_USER, JSON.stringify(userInfo))
    localStorage.setItem(STORAGE_KEYS.WEB3AUTH_ADDRESSES, JSON.stringify(addresses))
    if (nickname) {
      localStorage.setItem(STORAGE_KEYS.PLAYER_NICKNAME, nickname)
    }
  } catch (error) {
    console.error('Error saving auth session:', error)
  }
}

export const loadAuthSession = () => {
  try {
    const address = localStorage.getItem(STORAGE_KEYS.WEB3AUTH_ADDRESS)
    const userInfoStr = localStorage.getItem(STORAGE_KEYS.WEB3AUTH_USER)
    const addressesStr = localStorage.getItem(STORAGE_KEYS.WEB3AUTH_ADDRESSES)
    const nickname = localStorage.getItem(STORAGE_KEYS.PLAYER_NICKNAME)

    if (!address) return null

    return {
      address,
      userInfo: userInfoStr ? JSON.parse(userInfoStr) : null,
      addresses: addressesStr ? JSON.parse(addressesStr) : {},
      nickname,
    }
  } catch (error) {
    console.error('Error loading auth session:', error)
    return null
  }
}

export const clearAuthSession = () => {
  try {
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key)
    })
  } catch (error) {
    console.error('Error clearing auth session:', error)
  }
}

export const hasAuthSession = () => {
  return !!localStorage.getItem(STORAGE_KEYS.WEB3AUTH_ADDRESS)
}
