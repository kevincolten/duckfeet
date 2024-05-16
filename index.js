window.addEventListener('DOMContentLoaded', async () => {
  var { pdfjsLib } = globalThis;

  // The workerSrc property shall be specified.
  pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-4.2.67-dist/build/pdf.worker.mjs';

  const url = './duckfeet.pdf'; // Link to your PDF file

  let pdfDoc = null,
    pageNum = 1,
    selectionStart = {},
    selectionEnd = {},
    pageIsRendering = false,
    pageNumIsPending = null,
    wordBoxes = [],
    clickedWords = [];

    window.isSelecting = false;
    window.isDowning = false;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.style.touchAction="none";
  document.getElementById('pdf-renderer').appendChild(canvas);

  const pageInfo = document.getElementById('page-info'),
        btnPrev = document.getElementById('prev-page'),
        btnNext = document.getElementById('next-page'),
        startSelectBtn = document.getElementById('start-select')

  // Render the page
  const renderPage = async num => {
    pageIsRendering = true;
    // Get page
    const page = await pdfDoc.getPage(num)
    const viewport = page.getViewport({ scale: 1, rotation: 360, dontFlip: false });
    
    // canvas.height = viewport.height < 750 ? viewport.height : 750;
    canvas.height = viewport.height;
    // canvas.width = viewport.width < 640 ? viewport.width : 640;
    canvas.width = viewport.width;
    canvas.classList.add('shadow-lg');
    const renderCtx = {
        canvasContext: ctx,
        viewport
    };
    
    await page.render(renderCtx).promise
    pageIsRendering = false;

    if (pageNumIsPending !== null) {
        renderPage(pageNumIsPending);
        pageNumIsPending = null;
    }
    pageInfo.textContent = `Page ${pageNum} of ${pdfDoc.numPages}`;
  };

  // Load PDF
  pdfDoc = await pdfjsLib.getDocument(url).promise;
  renderPage(pageNum);

  btnPrev.addEventListener('click', () => {
    if (pageNum <= 1) {
        return;
    }
    pageNum--;
    if (!pageIsRendering) {
        renderPage(pageNum);
    } else {
        pageNumIsPending = pageNum;
    }
    wordBoxes = [];
});

btnNext.addEventListener('click', () => {
    if (pageNum >= pdfDoc.numPages) {
        return;
    }
    pageNum++;
    if (!pageIsRendering) {
        renderPage(pageNum);
    } else {
        pageNumIsPending = pageNum;
    }
    wordBoxes = [];
});

function getCoordinates(event) {
  if (event.touches) {
      event = event.touches[0]; // Get the first touch
  }
  return {
      x: event.clientX - canvas.getBoundingClientRect().left,
      y: event.clientY - canvas.getBoundingClientRect().top
  };
}

canvas.addEventListener('pointerdown', function(event) {
  event.preventDefault(); // Prevent scrolling on touch start
  if (!window.isSelecting) return;
  startDrawing(event);
}, { passive: false }); 

canvas.addEventListener('pointerup', endDrawing);

function startDrawing(event) {
  if (!window.isSelecting) return;
  const coords = getCoordinates(event);
  window.isSelecting = true;
  window.isDowning = true;
  selectionStart = { x: coords.x, y: coords.y };
}

function draw(event) {
  if (!(window.isSelecting && window.isDowning)) return;
  const coords = getCoordinates(event);
  drawSelection(coords.x, coords.y);
}

function endDrawing(event) {
  if (!(window.isSelecting && window.isDowning)) return;
  canvas.removeEventListener('pointermove', draw);
  window.isSelecting = false;
  window.isDowning = false;
  const coords = getCoordinates(event);
  selectionEnd = { x: coords.x, y: coords.y };

  clearRectangle(); // Clear the rectangle once selection is done
  performOCR();
}

  startSelectBtn.addEventListener('click', (e) => {
    window.isSelecting = true;
    let move = 0;
    canvas.addEventListener('pointermove', (e) => {
      if (++move % 15 === 0 && window.isSelecting && window.isDowning) {
        draw(e)
      };
    });
  });

// Function to draw the selection rectangle
const drawSelection = async (x, y) => {
  await clearRectangle(); // Clear previous rectangle
  ctx.beginPath();
  ctx.rect(selectionStart.x, selectionStart.y, x - selectionStart.x, y - selectionStart.y);
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.closePath();
};

// Function to clear the drawn rectangle
const clearRectangle = async () => {
  await renderPage(pageNum); // Re-render the page to clear previous drawings
};


  // Perform OCR on the selected area
const performOCR = async () => {
  const x = Math.min(selectionStart.x, selectionEnd.x);
  const y = Math.min(selectionStart.y, selectionEnd.y);
  const width = Math.abs(selectionEnd.x - selectionStart.x);
  const height = Math.abs(selectionEnd.y - selectionStart.y);

  const imageData = ctx.getImageData(x, y, width, height);

  // Create a new canvas to draw the cropped image for OCR
  const ocrCanvas = document.createElement('canvas');
  ocrCanvas.width = width;
  ocrCanvas.height = height;
  const ocrCtx = ocrCanvas.getContext('2d');
  ocrCtx.putImageData(imageData, 0, 0);

  let { data: { text, words } } = await Tesseract.recognize(
      ocrCanvas.toDataURL(),
      'eng',
      {
          logger: m => {
            
            document.querySelector('.progress-bar').style.width = m.progress * 100 + '%'
           } // Log progress
      }
  )
  drawWordBoundingBoxes(words, x, y); // Draw bounding boxes around detected words
};

// Function to draw bounding boxes around detected words
const drawWordBoundingBoxes = (words, offsetX, offsetY) => {
  wordBoxes = words.map(word => ({
    x0:offsetX + word.bbox.x0 - 2, 
    y0:      offsetY + word.bbox.y0 - 2, 
    x1:      word.bbox.x1 - word.bbox.x0 + 4,
    y1:      word.bbox.y1 - word.bbox.y0 + 4,
    text: word.text
}));

};

canvas.addEventListener('click', function(event) {
  event.preventDefault();
  event.stopPropagation();
  if (!wordBoxes.length) return;
  const clickX = event.offsetX;
  const clickY = event.offsetY;

  // Check if click is within any word box
  
  const clickedWord = wordBoxes.find(box =>
      clickX >= box.x0 && clickX <= box.x0 + box.x1 &&
      clickY >= box.y0 && clickY <= box.y0 + box.y1
  );

  

  if (clickedWord) {
      // Display the word or do something else with it
      // alert(`Clicked Word: ${clickedWord.text}`);
      clickedWords.push(clickedWord.text);
      document.querySelector('#num-clicked').textContent = clickedWords.length;
      
      document.querySelector('#clicked-words').innerHTML = clickedWords.toReversed().map(w => `
        <h5><span class="badge text-bg-secondary mx-1" data-word={${w}}>${w}</span></h5>
      `).join('');
      speak(clickedWord.text.toLowerCase());
      [...document.querySelectorAll('[data-word]')].forEach(el => el.addEventListener('click', function(event) {
        const word = event.target.dataset.word;
        speak(word);
      })); 
  }
});

function speak(text) {
  if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.75; // Speed of speech. Default is 1.
      utterance.pitch = 1; // Pitch of speech. Default is 1.
      utterance.volume = 1; // Volume of speech. Default is 1 (max).

      window.speechSynthesis.speak(utterance);
  } else {
      
  }
}
});
