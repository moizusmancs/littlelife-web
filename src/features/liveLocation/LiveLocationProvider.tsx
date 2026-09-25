import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { createLiveLocationController } from './liveLocationController'
import { LiveLocationContext } from './liveLocationContext'

/**
 * A layout route around every citizen screen: it owns the one live-location controller, so **sharing survives moving between screens** (a person
 * who turns it on in Safety Groups and then opens the map is still sharing) and ends when they leave the citizen app — logging out unmounts it,
 * which closes the socket and stops the position watch. It also tells the controller when the tab goes to the back or comes forward
 * (`visibilitychange`), because everything about live location on the web depends on that: no background location, and a hidden tab must not hold the socket.
 */
export function LiveLocationProvider() {
  const [controller] = useState(() => createLiveLocationController({ initialVisible: document.visibilityState !== 'hidden' }))

  useEffect(() => {
    const onVisibility = () => controller.setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      controller.dispose()
    }
  }, [controller])

  return (
    <LiveLocationContext.Provider value={controller}>
      <Outlet />
    </LiveLocationContext.Provider>
  )
}
