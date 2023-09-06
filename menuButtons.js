function clearMenuButtons() {
    let tempButtons = window.top.document.getElementsByClassName('temp-btn')

    while(tempButtons.length > 0) {
        tempButtons[0].remove()
    }

    window.top.document.getElementsByClassName('toggle-menu')[0].classList.add('me-1')
    window.top.document.getElementById('menuButtonsContextMenu')?.remove()
}

function addMenuButton(title, onclick, parentDiv = window.top.document.getElementById('menuButtons')){ 
    var newi = window.top.document.createElement('i')
    newi.class='fa-solid'
    newi.innerText = title

    newi.onclick = () => onclick(newi)

    var newMenuButton = window.top.document.createElement('div')
    newMenuButton.className = 'ui-btn px-1 me-1 temp-btn'

    newMenuButton.appendChild(newi)

    parentDiv.appendChild(newMenuButton)
}

function addMenuButtonContextMenu() {
    let menuButtons = window.top.document.getElementById('menuButtons')
    let menuButtonsContextMenu  = window.top.document.createElement('div')
    
    menuButtonsContextMenu.className="ui ui-content invisible"
    menuButtonsContextMenu.style="position:absolute;bottom:50px;right:5px;"
    menuButtonsContextMenu.id='menuButtonsContextMenu'

    menuButtons.appendChild(menuButtonsContextMenu)

}

function toggleMenuButtonContextMenu() {
    let menuButtonsContextMenu = window.top.document.getElementById('menuButtonsContextMenu')
    if(menuButtonsContextMenu.className.includes('invisible')) {
        menuButtonsContextMenu.classList.remove('invisible')
    }
    else {
        menuButtonsContextMenu.classList.add('invisible')
    }
}

function addMenuContextMenuButton(title, onclick) {
    let menuButtonsContextMenu = window.top.document.getElementById('menuButtonsContextMenu')

    addMenuButton(title, onclick, menuButtonsContextMenu)
}



// To use menu buttons first call clearMenuButtons() if you do not call clear then buttons from previous stop\start instances of running code will duplicate these buttons
//
// !!!! EXAMPLE !!!!
// in this example I clear the menu buttons to reset the ui state before I add one menu button with the gear icon ⚙️ that opens the context menu
// if you are using the context menu functionality you'll want to use this button probably
// the other buttons added are in the context menu, their pattern is similar to addMenuButton but these buttons show up in the context menu
// after you click the gear icon ⚙️
//
// clearMenuButtons()
// addMenuButtonContextMenu()
// addMenuButton('⚙️', e => {
//     toggleMenuButtonContextMenu()
// })
// addMenuContextMenuButton('Auto', (e) => { 
//     let manualMove = !dw.get(`${dw.c.name}_manualmove`)
//     if(manualMove)
//     {
//         e.innerText = 'Manual'
//     }
//     else
//     {
//         e.innerText = 'Auto'
//     }
//     dw.set(`${dw.c.name}_manualmove`, manualMove)
// })
// addMenuContextMenuButton(dw.get(`showComputerVision`) ? 'VFX 🐵' : 'VFX 🙈', (e) => { 
//     let showComputerVision = !dw.get(`showComputerVision`)
//     if(showComputerVision)
//     {
//         e.innerText = 'VFX 🐵'
//     }
//     else
//     {
//         e.innerText = 'VFX 🙈'
//     }
//     dw.set(`showComputerVision`, showComputerVision)
// })
//
//
// !!!! EXAMPLE !!!!
