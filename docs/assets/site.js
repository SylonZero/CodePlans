// Click any screenshot to see it full size; Escape or a click closes it.
(function () {
  var box = document.createElement('div')
  box.className = 'lightbox'
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-modal', 'true')
  box.innerHTML = '<img alt=""><p></p>'
  document.body.appendChild(box)
  var img = box.querySelector('img')
  var cap = box.querySelector('p')
  function close() { box.classList.remove('open'); img.removeAttribute('src') }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.shot a')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    var inner = a.querySelector('img')
    img.src = a.getAttribute('href')
    img.alt = inner ? inner.alt : ''
    cap.textContent = (inner ? inner.alt : '') + ' — click anywhere to close'
    box.classList.add('open')
  })
  box.addEventListener('click', close)
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close() })
})()
