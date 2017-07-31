(function ($) {
    $.fn.wssAnchor = function (options) {
		var defaults = {
			highlight: true,
			scrollable: true
		}
		var settings = $.extend(false, defaults, options);

		if (window.location.hash) {
			process(window.location.href,null);
		}
        this.click(function (e) {
			process(this.href,e);			
        });
		
		$('.overlay, .hl-on').live('click',function() {
			$('.hl-on').filter(function() {
				$(this).removeClass('hl-on');			
			});
			$('.overlay').hide();
		});

		function process(a,e) {
			
			var windowTop    = Math.floor($(window).scrollTop());
			var windowBottom = windowTop + Math.floor($(window).height());
			var id = a.substring(a.indexOf('#')+1);
			var url = a.substring(0,a.indexOf('#'));
			if (!($('#'+id).length)) return ;
			var topPos = Math.floor($('#'+id).offset().top);
			var widget = $('#'+id).parent();

			if (samePage(url)) {
				if (e!=null)
					e.preventDefault();
			}
			else {
				return;
			}
		
			if (topPos > windowTop && topPos+ widget.height() < windowBottom) {
				//do nothing
			}
			else {
				if (settings.highlight) {
					var adjust = ($(window).height() - $('#'+id).parent().height()) / 3;
					topPos-=adjust;
				}
				
				if (settings.scrollable) {
					jQuery('html, body').animate({scrollTop:topPos}, 500);
				}
				else 
					jQuery('html, body').animate({scrollTop:topPos}, 0);
					
			}
			
			if (settings.highlight) {
				$('#'+id).parent().addClass('hl-on');

				$('#overlay-top').css('width','100%').css('height',widget.offset().top);
				$('#overlay-left').css('top',widget.offset().top).css('width',widget.offset().left).css('height',widget.height());
				$('#overlay-bottom').css('top',widget.offset().top+widget.height()).css('width','100%').css('height',$(document).height()-(widget.offset().top+widget.height()));
				$('#overlay-right').css('top',widget.offset().top).css('left',widget.offset().left+widget.width()).css('width',$(document).width()-(widget.offset().left+widget.width())).css('height',widget.height());
				if ($.browser.msie)
					$('.overlay').show();
				else {
					$('.overlay').fadeIn(500);
				}
			}
		}
		
		function samePage(e) {
			if (isPreview()) {
				if (getPageId(window.location.search)==getPageId(e))
					return true;
				else
					return false;
			}
			else {
				if ('http://' + window.location.hostname + window.location.pathname==e) {
					return true;
				}
				else {
					return false;
				}
			}
		}
		
		function isPreview() {
			return (window.location.href.indexOf('webrenderer/ws')>=0);
		}
		
		function getPageId(url) {
			var match = RegExp('[?&]PageId=([^&]*)').exec(url);
			return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
		}			
	};
})(jQuery);