<script>
	import Timer from './Timer.svelte';
	import HowTo from './HowTo.svelte'
	let audio;
	function timer_finished(e){
		audio.play();
	}
</script>

<style>
	h1, h3 {
		text-align: center;
	}
</style>

<h1>Handwashing App</h1>

<Timer on:timer_finished={timer_finished} />
<HowTo />

<h3>
	<a target="_blank" href="http://awareness.who.int/gpsc/clean_hands_protection/en/">Picture Source</a>
	<a target="_blank" href="https://freesound.org/people/metrostock99/sounds/345086/">Sound Source</a>
 </h3>

 <audio bind:this={audio}>
	 <source src="sound.wav" />
 </audio>