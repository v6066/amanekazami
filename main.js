(function(storyContent) {

    // Create ink story from the content using inkjs
    var story = new inkjs.Story(storyContent);

    var savePoint = "";

    let savedTheme;
    let globalTagTheme;

    // Global tags - those at the top of the ink file
    // We support:
    //  # theme: dark
    //  # author: Your Name
    var globalTags = story.globalTags;
    if( globalTags ) {
        for(var i=0; i<story.globalTags.length; i++) {
            var globalTag = story.globalTags[i];
            var splitTag = splitPropertyTag(globalTag);

            // THEME: dark
            if( splitTag && splitTag.property == "theme" ) {
                globalTagTheme = splitTag.val;
            }

            // author: Your Name
            else if( splitTag && splitTag.property == "author" ) {
                var byline = document.querySelector('.byline');
                byline.innerHTML = "by "+splitTag.val;
            }
        }
    }

    var storyContainer = document.querySelector('#story');
    var outerScrollContainer = document.querySelector('.outerContainer');

    // Scroll control helpers
    var scrollAnimationId = null;
    var userIsInteracting = false;
    var interactionTimer = null;
    function cancelScrollAnimation() {
        if (scrollAnimationId) {
            cancelAnimationFrame(scrollAnimationId);
            scrollAnimationId = null;
        }
    }

    // page features setup
    setupTheme(globalTagTheme);
    var hasSave = loadSavePoint();
    setupButtons(hasSave);

    // Set initial save point
    savePoint = story.state.toJson();

    // Kick off the start of the story!
    continueStory(true);

    // Main story processing function. Each time this is called it generates
    // all the next content up as far as the next set of choices.
    function continueStory(firstTime) {

        var paragraphIndex = 0;
        var delay = 0.0;

        // Don't over-scroll past new content
        var previousBottomEdge = firstTime ? 0 : contentBottomEdgeY();

        // Generate story text - loop through available content
        while(story.canContinue) {

            // Get ink to generate the next paragraph
            var paragraphText = story.Continue();
            var tags = story.currentTags;

            // Any special tags included with this line
            var customClasses = [];
            for(var i=0; i<tags.length; i++) {
                var tag = tags[i];

                // Detect tags of the form "X: Y". Currently used for IMAGE and CLASS but could be
                // customised to be used for other things too.
                var splitTag = splitPropertyTag(tag);
				splitTag.property = splitTag.property.toUpperCase();

                // AUDIO: src
                if( splitTag && splitTag.property == "AUDIO" ) {
                  if('audio' in this) {
                    this.audio.pause();
                    this.audio.removeAttribute('src');
                    this.audio.load();
                  }
                  this.audio = new Audio(splitTag.val);
                  this.audio.play();
                }

                // AUDIOLOOP: src
                else if( splitTag && splitTag.property == "AUDIOLOOP" ) {
                  if('audioLoop' in this) {
                    this.audioLoop.pause();
                    this.audioLoop.removeAttribute('src');
                    this.audioLoop.load();
                  }
                  this.audioLoop = new Audio(splitTag.val);
                  this.audioLoop.play();
                  this.audioLoop.loop = true;
                }

                // IMAGE: src
                if( splitTag && splitTag.property == "IMAGE" ) {
                    var imageElement = document.createElement('img');
                    imageElement.src = splitTag.val;
                    storyContainer.appendChild(imageElement);

                    imageElement.onload = () => {
                        console.log(`scrollingto ${previousBottomEdge}`)
                        scrollDown(previousBottomEdge)
                    }

                    showAfter(delay, imageElement);
                    delay += 200.0;
                }

                // LINK: url
                else if( splitTag && splitTag.property == "LINK" ) {
                    window.location.href = splitTag.val;
                }

                // LINKOPEN: url
                else if( splitTag && splitTag.property == "LINKOPEN" ) {
                    window.open(splitTag.val);
                }

                // BACKGROUND: src
                else if( splitTag && splitTag.property == "BACKGROUND" ) {
                    outerScrollContainer.style.backgroundImage = 'url('+splitTag.val+')';
                }

                // CLASS: className
                else if( splitTag && splitTag.property == "CLASS" ) {
                    customClasses.push(splitTag.val);
                }

                // CLEAR - removes all existing content.
                // RESTART - clears everything and restarts the story from the beginning
                else if( tag == "CLEAR" || tag == "RESTART" ) {
                    removeAll("p");
                    removeAll("img");

                    // Comment out this line if you want to leave the header visible when clearing
                    setVisible(".header", false);

                    if( tag == "RESTART" ) {
                        restart();
                        return;
                    }
                }
            }
		
		// Check if paragraphText is empty
		if (paragraphText.trim().length == 0) {
                continue; // Skip empty paragraphs
		}

            // Create paragraph element (initially hidden)
            var paragraphElement = document.createElement('p');
            paragraphElement.innerHTML = paragraphText;
            storyContainer.appendChild(paragraphElement);

            // Add any custom classes derived from ink tags
            for(var i=0; i<customClasses.length; i++)
                paragraphElement.classList.add(customClasses[i]);

            // Fade in paragraph after a short delay
            showAfter(delay, paragraphElement);
            delay += 200.0;
        }

        // Create HTML choices from ink choices
        story.currentChoices.forEach(function(choice) {

            // Create paragraph with anchor element
            var choiceTags = choice.tags;
            var customClasses = [];
            var isClickable = true;
            for(var i=0; i<choiceTags.length; i++) {
                var choiceTag = choiceTags[i];
                var splitTag = splitPropertyTag(choiceTag);
				splitTag.property = splitTag.property.toUpperCase();

                if(choiceTag.toUpperCase() == "UNCLICKABLE"){
                    isClickable = false
                }

                if( splitTag && splitTag.property == "CLASS" ) {
                    customClasses.push(splitTag.val);
                }

            }

            
            var choiceParagraphElement = document.createElement('p');
            choiceParagraphElement.classList.add("choice");

            for(var i=0; i<customClasses.length; i++)
                choiceParagraphElement.classList.add(customClasses[i]);

            if(isClickable){
                choiceParagraphElement.innerHTML = `<a href='#'>${choice.text}</a>`
            }else{
                choiceParagraphElement.innerHTML = `<span class='unclickable'>${choice.text}</span>`
            }
            storyContainer.appendChild(choiceParagraphElement);

            // Fade choice in after a short delay
            showAfter(delay, choiceParagraphElement);
            delay += 200.0;

            // Click on choice
            if(isClickable){
                var choiceAnchorEl = choiceParagraphElement.querySelectorAll("a")[0];
                choiceAnchorEl.addEventListener("click", function(event) {

                    // Don't follow <a> link
                    event.preventDefault();

                    // Extend height to fit
                    // We do this manually so that removing elements and creating new ones doesn't
                    // cause the height (and therefore scroll) to jump backwards temporarily.
                    storyContainer.style.height = contentBottomEdgeY()+"px";

                    // Remove all existing choices
                    removeAll(".choice");

                    // Tell the story where to go next
                    story.ChooseChoiceIndex(choice.index);

                    // This is where the save button will save from
                    savePoint = story.state.toJson();

                    // Aaand loop
                    continueStory();
                });
            }
        });

		// Unset storyContainer's height, allowing it to resize itself
		storyContainer.style.height = "";

        if( !firstTime )
            scrollDown(previousBottomEdge);

    }

    function restart() {
        story.ResetState();

        setVisible(".header", true);

        // set save point to here
        savePoint = story.state.toJson();

        continueStory(true);

        outerScrollContainer.scrollTo(0, 0);
    }

    // -----------------------------------
    // Various Helper functions
    // -----------------------------------

    // Detects whether the user accepts animations
    function isAnimationEnabled() {
        return window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    }

    // Fades in an element after a specified delay
    function showAfter(delay, el) {
        if( isAnimationEnabled() ) {
            el.classList.add("hide");
            setTimeout(function() { el.classList.remove("hide") }, delay);
        } else {
            // If the user doesn't want animations, show immediately
            el.classList.remove("hide");
        }
    }

    // Scrolls the page down, but no further than the bottom edge of what you could
    // see previously, so it doesn't go too far.
    function scrollDown(previousBottomEdge) {
        // If the user doesn't want animations, let them scroll manually
        if ( !isAnimationEnabled() ) {
            return;
        }

        // Line up top of screen with the bottom of where the previous content ended
        var target = previousBottomEdge;

        // Can't go further than the very bottom of the page
        var limit = outerScrollContainer.scrollHeight - outerScrollContainer.clientHeight;
        if( target > limit ) target = limit;

        var start = outerScrollContainer.scrollTop;

        var dist = target - start;
        // duration should scale with absolute distance but have a sensible min
        var duration = Math.max(200, 300 + 300*Math.abs(dist)/100);
        var startTime = null;
        cancelScrollAnimation(); // cancel any previous animation
        function step(time) {
            // stop animation if user is interacting (prevents fighting user scroll)
            if (userIsInteracting) {
                cancelAnimationFrame(scrollAnimationId);
                scrollAnimationId = null;
                return;
            }

            if( startTime == null ) startTime = time;
            var t = (time-startTime) / duration;
            t = Math.max(0, Math.min(1, t));
            var lerp = 3*t*t - 2*t*t*t; // ease in/out
            outerScrollContainer.scrollTo(0, (1.0-lerp)*start + lerp*target);
            if( t < 1 ) {
                scrollAnimationId = requestAnimationFrame(step);
            } else {
                scrollAnimationId = null;
            }
        }
        scrollAnimationId = requestAnimationFrame(step);
    }

    // The Y coordinate of the bottom end of all the story content, used
    // for growing the container, and deciding how far to scroll.
    function contentBottomEdgeY() {
        var bottomElement = storyContainer.lastElementChild;
        return bottomElement ? bottomElement.offsetTop + bottomElement.offsetHeight : 0;
    }

    // Remove all elements that match the given selector. Used for removing choices after
    // you've picked one, as well as for the CLEAR and RESTART tags.
    function removeAll(selector)
    {
        var allElements = storyContainer.querySelectorAll(selector);
        for(var i=0; i<allElements.length; i++) {
            var el = allElements[i];
            el.parentNode.removeChild(el);
        }
    }

    // Used for hiding and showing the header when you CLEAR or RESTART the story respectively.
    function setVisible(selector, visible)
    {
        var allElements = storyContainer.querySelectorAll(selector);
        for(var i=0; i<allElements.length; i++) {
            var el = allElements[i];
            if( !visible )
                el.classList.add("invisible");
            else
                el.classList.remove("invisible");
        }
    }

    // Helper for parsing out tags of the form:
    //  # PROPERTY: value
    // e.g. IMAGE: source path
    function splitPropertyTag(tag) {
        var propertySplitIdx = tag.indexOf(":");
        if( propertySplitIdx != null ) {
            var property = tag.substr(0, propertySplitIdx).trim();
            var val = tag.substr(propertySplitIdx+1).trim();
            return {
                property: property,
                val: val
            };
        }

        return null;
    }

    // Loads save state if exists in the browser memory
    function loadSavePoint() {

        try {
            let savedState = window.localStorage.getItem('save-state');
            if (savedState) {
                story.state.LoadJson(savedState);
                return true;
            }
        } catch (e) {
            console.debug("Couldn't load save state");
        }
        return false;
    }

    // Detects which theme (light or dark) to use
    function setupTheme(globalTagTheme) {

        // load theme from browser memory
        var savedTheme;
        try {
            savedTheme = window.localStorage.getItem('theme');
        } catch (e) {
            console.debug("Couldn't load saved theme");
        }

        // Check whether the OS/browser is configured for dark mode
        var browserDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

        if (savedTheme === "dark"
            || (savedTheme == undefined && globalTagTheme === "dark")
            || (savedTheme == undefined && globalTagTheme == undefined && browserDark))
            document.body.classList.add("dark");
    }

    // Used to hook up the functionality for global functionality buttons
    function setupButtons(hasSave) {

        let rewindEl = document.getElementById("rewind");
        if (rewindEl) rewindEl.addEventListener("click", function(event) {
            removeAll("p");
            removeAll("img");
            setVisible(".header", false);
            restart();
        });

        let saveEl = document.getElementById("save");
        if (saveEl) saveEl.addEventListener("click", function(event) {
            try {
                window.localStorage.setItem('save-state', savePoint);
                document.getElementById("reload").removeAttribute("disabled");
                window.localStorage.setItem('theme', document.body.classList.contains("dark") ? "dark" : "");
            } catch (e) {
                console.warn("Couldn't save state");
            }

        });

        let reloadEl = document.getElementById("reload");
        if (!hasSave) {
            reloadEl.setAttribute("disabled", "disabled");
        }
        reloadEl.addEventListener("click", function(event) {
            if (reloadEl.getAttribute("disabled"))
                return;

            removeAll("p");
            removeAll("img");
            try {
                let savedState = window.localStorage.getItem('save-state');
                if (savedState) story.state.LoadJson(savedState);
            } catch (e) {
                console.debug("Couldn't load save state");
            }
            continueStory(true);
        });

        let themeSwitchEl = document.getElementById("theme-switch");
        if (themeSwitchEl) themeSwitchEl.addEventListener("click", function(event) {
            document.body.classList.add("switched");
            document.body.classList.toggle("dark");
        });

        // 章节导航功能已移除：原先自动生成的章节导航按钮已删除。

        // 添加进度条功能
        const progressBar = document.createElement('div');
        progressBar.id = 'progress-bar';
        document.body.appendChild(progressBar);

        // Update progress bar based on the outer scroll container's scroll (throttled via rAF)
        let scrollRaf = null;
        function updateProgressBar() {
            const scrollTop = outerScrollContainer.scrollTop;
            const docHeight = outerScrollContainer.scrollHeight;
            const winHeight = outerScrollContainer.clientHeight;
            const denom = (docHeight - winHeight) || 1; // avoid division by zero
            const scrollPercent = Math.max(0, Math.min(100, (scrollTop / denom) * 100));
            progressBar.style.width = scrollPercent + '%';
            scrollRaf = null;
        }
        outerScrollContainer.addEventListener('scroll', () => {
            if (scrollRaf == null) scrollRaf = requestAnimationFrame(updateProgressBar);
        }, { passive: true });

        // If user interacts (wheel/touch/pointer), cancel programmatic scrolling to avoid fighting
        ['wheel', 'touchstart', 'touchmove', 'pointerdown'].forEach(evt => {
            outerScrollContainer.addEventListener(evt, () => {
                userIsInteracting = true;
                cancelScrollAnimation();
                clearTimeout(interactionTimer);
                interactionTimer = setTimeout(() => { userIsInteracting = false; }, 250);
            }, { passive: true });
        });

        // 阅读模式、字体/行距控制与全屏功能
        const controlsEl = document.getElementById('controls');
        const toggleReadingMode = () => {
            document.body.classList.toggle('reading-mode');
        };

        // Font and line-height controls (persisted)
        let currentFontSize = parseInt(localStorage.getItem('fontSize') || '13', 10);
        let currentLineHeight = parseFloat(localStorage.getItem('lineHeight') || '1.7');
        function applyTypography() {
            document.documentElement.style.setProperty('--content-font-size', currentFontSize+'pt');
            document.documentElement.style.setProperty('--content-line-height', currentLineHeight);
        }
        applyTypography();

        function changeFontSize(delta) {
            currentFontSize = Math.max(10, Math.min(24, currentFontSize + delta));
            localStorage.setItem('fontSize', currentFontSize);
            applyTypography();
        }
        function changeLineHeight(delta) {
            currentLineHeight = Math.max(1.1, Math.min(2.5, Math.round((currentLineHeight+delta)*100)/100));
            localStorage.setItem('lineHeight', currentLineHeight);
            applyTypography();
        }

        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
                document.body.classList.add('fullscreen');
            } else {
                document.exitFullscreen && document.exitFullscreen();
                document.body.classList.remove('fullscreen');
            }
        }

        if (controlsEl) {
            const rmBtn = document.createElement('a');
            rmBtn.href = '#';
            rmBtn.id = 'reading-mode-toggle';
            rmBtn.textContent = 'reading';
            rmBtn.addEventListener('click', function(e){ e.preventDefault(); toggleReadingMode(); });
            controlsEl.appendChild(rmBtn);

            const decBtn = document.createElement('a');
            decBtn.href = '#';
            decBtn.id = 'font-decrease';
            decBtn.textContent = 'A-';
            decBtn.addEventListener('click', function(e){ e.preventDefault(); changeFontSize(-1); });

            const incBtn = document.createElement('a');
            incBtn.href = '#';
            incBtn.id = 'font-increase';
            incBtn.textContent = 'A+';
            incBtn.addEventListener('click', function(e){ e.preventDefault(); changeFontSize(1); });

            const lhDec = document.createElement('a');
            lhDec.href = '#';
            lhDec.id = 'lh-decrease';
            lhDec.textContent = 'LH-';
            lhDec.addEventListener('click', function(e){ e.preventDefault(); changeLineHeight(-0.1); });

            const lhInc = document.createElement('a');
            lhInc.href = '#';
            lhInc.id = 'lh-increase';
            lhInc.textContent = 'LH+';
            lhInc.addEventListener('click', function(e){ e.preventDefault(); changeLineHeight(0.1); });

            const fsBtn = document.createElement('a');
            fsBtn.href = '#';
            fsBtn.id = 'fullscreen-toggle';
            fsBtn.textContent = 'fs';
            fsBtn.addEventListener('click', function(e){ e.preventDefault(); toggleFullscreen(); });

            controlsEl.appendChild(decBtn);
            controlsEl.appendChild(incBtn);
            controlsEl.appendChild(lhDec);
            controlsEl.appendChild(lhInc);
            controlsEl.appendChild(fsBtn);
        }

        // 高亮功能已移除：将现有的 .quoted-emphasis 元素还原为普通文本
        function removeExistingHighlights() {
            if (!storyContainer) return;
            const spans = storyContainer.querySelectorAll('.quoted-emphasis');
            spans.forEach(s => {
                s.replaceWith(document.createTextNode(s.textContent));
            });
        }
        // 立即清理页面上已存在的高亮元素，之后不再自动高亮新文本。
        removeExistingHighlights();
    }

})(storyContent);
